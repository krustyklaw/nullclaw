import sys

with open("src/desktop.zig", "r") as f:
    content = f.read()

search_code = """fn runAgentTurn(
    allocator: std.mem.Allocator,
    message: []const u8,
    hist: []const HistoryEntry,
) ![]u8 {
    var cfg = try Config.load(allocator);
    defer cfg.deinit();

    var noop_obs = observability_mod.NoopObserver{};
    const obs = noop_obs.observer();"""

replacement_code = """fn runAgentTurn(
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

    const obs_ptr = if (runtime_observer) |ro| ro.observer() else observability_mod.NoopObserver{}.observer();"""

if search_code in content:
    content = content.replace(search_code, replacement_code)
    print("PATCHING!")
else:
    print("SEARCH NOT FOUND")

search_code_2 = """    var agent = try Agent.fromConfigWithProfile(allocator, &cfg, runtime_provider.provider(), tools, mem_opt, obs, null);"""
replacement_code_2 = """    var agent = try Agent.fromConfigWithProfile(allocator, &cfg, runtime_provider.provider(), tools, mem_opt, obs_ptr, null);"""

if search_code_2 in content:
    content = content.replace(search_code_2, replacement_code_2)
    print("PATCHING 2!")
else:
    print("SEARCH 2 NOT FOUND")

search_code_3 = """fn handleChat(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const parsed = std.json.parseFromSlice(ChatReq, allocator, body, .{
        .ignore_unknown_fields = true,
    }) catch {
        return allocator.dupe(u8, "{\\"error\\":\\"invalid JSON\\"}");
    };
    defer parsed.deinit();

    const response = runAgentTurn(allocator, parsed.value.message, parsed.value.history) catch |err| {"""

replacement_code_3 = """fn handleChat(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const parsed = std.json.parseFromSlice(ChatReq, allocator, body, .{
        .ignore_unknown_fields = true,
    }) catch {
        return allocator.dupe(u8, "{\\"error\\":\\"invalid JSON\\"}");
    };
    defer parsed.deinit();

    var gateway_thread_observer = GatewayThreadObserver.init(allocator);
    defer gateway_thread_observer.deinit();

    const start_seq = gateway_thread_observer.currentSeq();

    const response = runAgentTurn(allocator, parsed.value.message, parsed.value.history, &gateway_thread_observer) catch |err| {"""

if search_code_3 in content:
    content = content.replace(search_code_3, replacement_code_3)
    print("PATCHING 3!")
else:
    print("SEARCH 3 NOT FOUND")

search_code_4 = """        return out.toOwnedSlice(allocator);
    };
    defer allocator.free(response);

    var out: std.ArrayListUnmanaged(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.appendSlice(allocator, "{\\"response\\":");
    try appendJsonString(&out, allocator, response);
    try out.append(allocator, '}');
    return out.toOwnedSlice(allocator);
}"""

replacement_code_4 = """        return out.toOwnedSlice(allocator);
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
    try out.appendSlice(allocator, "{\\"response\\":");
    try appendJsonString(&out, allocator, response);
    try out.appendSlice(allocator, ",\\"thread_events\\":");
    try out.appendSlice(allocator, thread_events_json);
    try out.append(allocator, '}');
    return out.toOwnedSlice(allocator);
}"""

if search_code_4 in content:
    content = content.replace(search_code_4, replacement_code_4)
    print("PATCHING 4!")
else:
    print("SEARCH 4 NOT FOUND")

with open("src/desktop.zig", "w") as f:
    f.write(content)
