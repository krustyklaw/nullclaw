import sys

with open("src/desktop.zig", "r") as f:
    content = f.read()

replacement = """fn runAgentTurn(
    allocator: std.mem.Allocator,
    message: []const u8,
    hist: []const HistoryEntry,
    gateway_thread_observer: *GatewayThreadObserver,
) ![]u8 {
    var cfg = try Config.load(allocator);
    defer cfg.deinit();

    var runtime_observer: ?*observability_mod.RuntimeObserver = null;
    defer if (runtime_observer) |obs| obs.destroy();

    runtime_observer = observability_mod.RuntimeObserver.create(
        allocator,
        .{
            .workspace_dir = cfg.workspace_dir,
            .backend = cfg.diagnostics.backend,
            .otel_endpoint = cfg.diagnostics.otel_endpoint,
            .otel_service_name = cfg.diagnostics.otel_service_name,
        },
        cfg.diagnostics.otel_headers,
        &.{gateway_thread_observer.observer()},
    ) catch null;

    const obs_ptr = if (runtime_observer) |ro| ro.observer() else observability_mod.NoopObserver{}.observer();

    var tracker = security_mod.RateTracker.init(allocator, cfg.autonomy.max_actions_per_hour);
    defer tracker.deinit();

    var policy = security_mod.SecurityPolicy{
        .autonomy = cfg.autonomy.level,
        .workspace_dir = cfg.workspace_dir,
        .workspace_only = cfg.autonomy.workspace_only,
        .allowed_commands = security_mod.resolveAllowedCommands(
            cfg.autonomy.level,
            cfg.autonomy.allowed_commands,
        ),
        .max_actions_per_hour = cfg.autonomy.max_actions_per_hour,
        .require_approval_for_medium_risk = cfg.autonomy.require_approval_for_medium_risk,
        .block_high_risk_commands = cfg.autonomy.block_high_risk_commands,
        .allow_raw_url_chars = cfg.autonomy.allow_raw_url_chars,
        .tracker = &tracker,
    };

    var runtime_provider = try providers_mod.runtime_bundle.RuntimeProviderBundle.init(allocator, &cfg);
    defer runtime_provider.deinit();

    var subagent_manager = subagent_mod.SubagentManager.init(allocator, &cfg, null, .{});
    subagent_manager.task_runner = subagent_runner_mod.runTaskWithTools;
    defer subagent_manager.deinit();

    var mem_rt = memory_mod.initRuntime(allocator, &cfg.memory, cfg.workspace_dir);
    defer if (mem_rt) |*rt| rt.deinit();
    const mem_opt: ?memory_mod.Memory = if (mem_rt) |rt| rt.memory else null;

    const bootstrap_provider: ?bootstrap_mod.BootstrapProvider =
        bootstrap_mod.createProvider(allocator, cfg.memory.backend, mem_opt, cfg.workspace_dir) catch null;
    defer if (bootstrap_provider) |bp| bp.deinit();

    try onboard.scaffoldWorkspace(allocator, cfg.workspace_dir, &onboard.ProjectContext{
        .user_name = cfg.user_name orelse "User",
        .agent_name = cfg.agent_name orelse "krustyklaw",
    }, bootstrap_provider);

    const tools = try tools_mod.allTools(allocator, cfg.workspace_dir, .{
        .http_enabled = cfg.http_request.enabled,
        .http_allowed_domains = cfg.http_request.allowed_domains,
        .http_max_response_size = cfg.http_request.max_response_size,
        .http_timeout_secs = cfg.http_request.timeout_secs,
        .web_search_base_url = cfg.http_request.search_base_url,
        .web_search_provider = cfg.http_request.search_provider,
        .web_search_fallback_providers = cfg.http_request.search_fallback_providers,
        .browser_enabled = cfg.browser.enabled,
        .mcp_server_configs = cfg.mcp_servers,
        .agents = cfg.agents,
        .configured_providers = cfg.providers,
        .fallback_api_key = runtime_provider.primaryApiKey(),
        .tools_config = cfg.tools,
        .allowed_paths = cfg.autonomy.allowed_paths,
        .policy = &policy,
        .subagent_manager = &subagent_manager,
        .bootstrap_provider = bootstrap_provider,
        .backend_name = cfg.memory.backend,
    });
    defer tools_mod.deinitTools(allocator, tools);
    tools_mod.bindMemoryTools(tools, mem_opt);
    if (mem_rt) |*rt| tools_mod.bindMemoryRuntime(tools, rt);

    var agent = try Agent.fromConfigWithProfile(allocator, &cfg, runtime_provider.provider(), tools, mem_opt, obs_ptr, null);
    defer agent.deinit();
    agent.policy = &policy;
    if (mem_rt) |rt| agent.session_store = rt.session_store;
    if (mem_rt) |*rt| {
        agent.response_cache = rt.response_cache;
        agent.mem_rt = rt;
    }

    // Restore conversation history from frontend
    try agent.loadHistory(hist);

    const response = try agent.turn(message);
    defer allocator.free(response);

    return allocator.dupe(u8, response);
}

fn handleChat(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const parsed = std.json.parseFromSlice(ChatReq, allocator, body, .{
        .ignore_unknown_fields = true,
    }) catch {
        return allocator.dupe(u8, "{\"error\":\"invalid JSON\"}");
    };
    defer parsed.deinit();

    var gateway_thread_observer = GatewayThreadObserver.init(allocator);
    defer gateway_thread_observer.deinit();

    const start_seq = gateway_thread_observer.currentSeq();

    const response = runAgentTurn(allocator, parsed.value.message, parsed.value.history, &gateway_thread_observer) catch |err| {
        var out: std.ArrayListUnmanaged(u8) = .empty;
        errdefer out.deinit(allocator);
        if (err == error.AllProvidersFailed) {
            const detail = providers_mod.snapshotLastApiErrorDetail(allocator) catch null;
            defer if (detail) |d| allocator.free(d);
            const detail_str = detail orelse "No API error detail available. Verify your model name, API key, and that the provider service is reachable.";
            try out.appendSlice(allocator, "{\"error\":\"AllProvidersFailed\",\"detail\":");
            try appendJsonString(&out, allocator, detail_str);
            try out.append(allocator, '}');
        } else {
            try out.appendSlice(allocator, "{\"error\":");
            try appendJsonString(&out, allocator, @errorName(err));
            try out.append(allocator, '}');
        }
        return out.toOwnedSlice(allocator);
    };
    defer allocator.free(response);

    const tool_events = gateway_thread_observer.collectSince(allocator, start_seq) catch &.{};
    defer {
        for (tool_events) |e| allocator.free(e.tool);
        allocator.free(tool_events);
    }
    const thread_events_json = buildThreadEventsJson(allocator, tool_events) catch "[]";
    defer if (thread_events_json.ptr != "[]".ptr) allocator.free(thread_events_json);

    var out: std.ArrayListUnmanaged(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.appendSlice(allocator, "{\"response\":");
    try appendJsonString(&out, allocator, response);
    try out.appendSlice(allocator, ",\"thread_events\":");
    try out.appendSlice(allocator, thread_events_json);
    try out.append(allocator, '}');
    return out.toOwnedSlice(allocator);
}"""

search = """fn runAgentTurn(
    allocator: std.mem.Allocator,
    message: []const u8,
    hist: []const HistoryEntry,
) ![]u8 {
    var cfg = try Config.load(allocator);
    defer cfg.deinit();

    var noop_obs = observability_mod.NoopObserver{};
    const obs = noop_obs.observer();

    var tracker = security_mod.RateTracker.init(allocator, cfg.autonomy.max_actions_per_hour);
    defer tracker.deinit();

    var policy = security_mod.SecurityPolicy{
        .autonomy = cfg.autonomy.level,
        .workspace_dir = cfg.workspace_dir,
        .workspace_only = cfg.autonomy.workspace_only,
        .allowed_commands = security_mod.resolveAllowedCommands(
            cfg.autonomy.level,
            cfg.autonomy.allowed_commands,
        ),
        .max_actions_per_hour = cfg.autonomy.max_actions_per_hour,
        .require_approval_for_medium_risk = cfg.autonomy.require_approval_for_medium_risk,
        .block_high_risk_commands = cfg.autonomy.block_high_risk_commands,
        .allow_raw_url_chars = cfg.autonomy.allow_raw_url_chars,
        .tracker = &tracker,
    };

    var runtime_provider = try providers_mod.runtime_bundle.RuntimeProviderBundle.init(allocator, &cfg);
    defer runtime_provider.deinit();

    var subagent_manager = subagent_mod.SubagentManager.init(allocator, &cfg, null, .{});
    subagent_manager.task_runner = subagent_runner_mod.runTaskWithTools;
    defer subagent_manager.deinit();

    var mem_rt = memory_mod.initRuntime(allocator, &cfg.memory, cfg.workspace_dir);
    defer if (mem_rt) |*rt| rt.deinit();
    const mem_opt: ?memory_mod.Memory = if (mem_rt) |rt| rt.memory else null;

    const bootstrap_provider: ?bootstrap_mod.BootstrapProvider =
        bootstrap_mod.createProvider(allocator, cfg.memory.backend, mem_opt, cfg.workspace_dir) catch null;
    defer if (bootstrap_provider) |bp| bp.deinit();

    try onboard.scaffoldWorkspace(allocator, cfg.workspace_dir, &onboard.ProjectContext{
        .user_name = cfg.user_name orelse "User",
        .agent_name = cfg.agent_name orelse "krustyklaw",
    }, bootstrap_provider);

    const tools = try tools_mod.allTools(allocator, cfg.workspace_dir, .{
        .http_enabled = cfg.http_request.enabled,
        .http_allowed_domains = cfg.http_request.allowed_domains,
        .http_max_response_size = cfg.http_request.max_response_size,
        .http_timeout_secs = cfg.http_request.timeout_secs,
        .web_search_base_url = cfg.http_request.search_base_url,
        .web_search_provider = cfg.http_request.search_provider,
        .web_search_fallback_providers = cfg.http_request.search_fallback_providers,
        .browser_enabled = cfg.browser.enabled,
        .mcp_server_configs = cfg.mcp_servers,
        .agents = cfg.agents,
        .configured_providers = cfg.providers,
        .fallback_api_key = runtime_provider.primaryApiKey(),
        .tools_config = cfg.tools,
        .allowed_paths = cfg.autonomy.allowed_paths,
        .policy = &policy,
        .subagent_manager = &subagent_manager,
        .bootstrap_provider = bootstrap_provider,
        .backend_name = cfg.memory.backend,
    });
    defer tools_mod.deinitTools(allocator, tools);
    tools_mod.bindMemoryTools(tools, mem_opt);
    if (mem_rt) |*rt| tools_mod.bindMemoryRuntime(tools, rt);

    var agent = try Agent.fromConfigWithProfile(allocator, &cfg, runtime_provider.provider(), tools, mem_opt, obs, null);
    defer agent.deinit();
    agent.policy = &policy;
    if (mem_rt) |rt| agent.session_store = rt.session_store;
    if (mem_rt) |*rt| {
        agent.response_cache = rt.response_cache;
        agent.mem_rt = rt;
    }

    // Restore conversation history from frontend
    try agent.loadHistory(hist);

    const response = try agent.turn(message);
    defer allocator.free(response);

    return allocator.dupe(u8, response);
}

fn handleChat(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const parsed = std.json.parseFromSlice(ChatReq, allocator, body, .{
        .ignore_unknown_fields = true,
    }) catch {
        return allocator.dupe(u8, "{\"error\":\"invalid JSON\"}");
    };
    defer parsed.deinit();

    const response = runAgentTurn(allocator, parsed.value.message, parsed.value.history) catch |err| {
        var out: std.ArrayListUnmanaged(u8) = .empty;
        errdefer out.deinit(allocator);
        if (err == error.AllProvidersFailed) {
            const detail = providers_mod.snapshotLastApiErrorDetail(allocator) catch null;
            defer if (detail) |d| allocator.free(d);
            const detail_str = detail orelse "No API error detail available. Verify your model name, API key, and that the provider service is reachable.";
            try out.appendSlice(allocator, "{\"error\":\"AllProvidersFailed\",\"detail\":");
            try appendJsonString(&out, allocator, detail_str);
            try out.append(allocator, '}');
        } else {
            try out.appendSlice(allocator, "{\"error\":");
            try appendJsonString(&out, allocator, @errorName(err));
            try out.append(allocator, '}');
        }
        return out.toOwnedSlice(allocator);
    };
    defer allocator.free(response);

    var out: std.ArrayListUnmanaged(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.appendSlice(allocator, "{\"response\":");
    try appendJsonString(&out, allocator, response);
    try out.append(allocator, '}');
    return out.toOwnedSlice(allocator);
}"""

if search in content and "gateway_thread_observer" not in content[content.find("fn runAgentTurn"):]:
    print("PATCHING!")
    content = content.replace(search, replacement.replace('\\"', '"'))
else:
    print("SEARCH NOT FOUND OR ALREADY PATCHED")

with open("src/desktop.zig", "w") as f:
    f.write(content)
