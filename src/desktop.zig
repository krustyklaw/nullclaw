//! Desktop UI server — serves the embedded single-page app at http://localhost:PORT
//! and provides a local JSON API for the setup wizard and chat interface.
//!
//! API surface:
//!   GET  /              → embedded HTML app
//!   GET  /api/status    → {"configured":bool,"provider":"...","model":"..."}
//!   GET  /api/providers → {"providers":[{"key":"...","label":"...","needs_api_key":bool,"default_model":"..."}]}
//!   POST /api/setup     → {"provider":"...","api_key":"...","model":"..."} → {"ok":true}
//!   POST /api/chat      → {"message":"...","history":[...]} → {"response":"..."}

const std = @import("std");
const builtin = @import("builtin");
const webview = @import("webview");

const Config = @import("config.zig").Config;
const onboard = @import("onboard.zig");
const providers_mod = @import("providers/root.zig");
const tools_mod = @import("tools/root.zig");
const memory_mod = @import("memory/root.zig");
const bootstrap_mod = @import("bootstrap/root.zig");
const observability_mod = @import("observability.zig");
const security_mod = @import("security/policy.zig");
const subagent_mod = @import("subagent.zig");
const subagent_runner_mod = @import("subagent_runner.zig");
const Agent = @import("agent/root.zig").Agent;
const skills_mod = @import("skills.zig");
const skillforge_mod = @import("skillforge.zig");

const HTML = @embedFile("assets/app.html");

const DEFAULT_PORT: u16 = 7280;
const MAX_REQUEST_SIZE: usize = 1_048_576; // 1 MB
const CONTENT_TYPE_HTML = "text/html; charset=utf-8";
const CONTENT_TYPE_JSON = "application/json; charset=utf-8";

// ── HTTP helpers ────────────────────────────────────────────────

fn writeResponse(stream: *std.net.Stream, status: []const u8, content_type: []const u8, body: []const u8) void {
    var buf: [512]u8 = undefined;
    const header = std.fmt.bufPrint(
        &buf,
        "HTTP/1.1 {s}\r\nContent-Type: {s}\r\nContent-Length: {d}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        .{ status, content_type, body.len },
    ) catch return;
    _ = stream.write(header) catch return;
    if (body.len > 0) _ = stream.write(body) catch {};
}

fn writeJson(stream: *std.net.Stream, status: []const u8, body: []const u8) void {
    writeResponse(stream, status, CONTENT_TYPE_JSON, body);
}

fn extractHeader(raw: []const u8, name: []const u8) ?[]const u8 {
    var pos: usize = 0;
    // Skip request line
    while (pos + 1 < raw.len) {
        if (raw[pos] == '\r' and raw[pos + 1] == '\n') {
            pos += 2;
            break;
        }
        pos += 1;
    }
    while (pos < raw.len) {
        const line_end = std.mem.indexOf(u8, raw[pos..], "\r\n") orelse break;
        const line = raw[pos .. pos + line_end];
        if (line.len == 0) break;
        if (line.len > name.len and line[name.len] == ':') {
            if (std.ascii.eqlIgnoreCase(line[0..name.len], name)) {
                var val_start: usize = name.len + 1;
                while (val_start < line.len and line[val_start] == ' ') val_start += 1;
                return line[val_start..];
            }
        }
        pos += line_end + 2;
    }
    return null;
}

fn extractBody(raw: []const u8) ?[]const u8 {
    const sep = "\r\n\r\n";
    const pos = std.mem.indexOf(u8, raw, sep) orelse return null;
    const body = raw[pos + sep.len ..];
    return if (body.len > 0) body else null;
}

/// On Windows, std.net.Stream.read() calls ReadFile() which fails with
/// ERROR_INVALID_PARAMETER (87) on overlapped sockets created by accept().
/// Use recv() via std.posix instead, which maps to WSARecv on Windows.
fn socketRecv(stream: *std.net.Stream, buf: []u8) !usize {
    if (comptime builtin.os.tag == .windows) {
        return std.posix.recv(stream.handle, buf, 0);
    }
    return stream.read(buf);
}

fn readRequest(allocator: std.mem.Allocator, stream: *std.net.Stream) ![]u8 {
    var buf: std.ArrayListUnmanaged(u8) = .empty;
    errdefer buf.deinit(allocator);
    var chunk: [4096]u8 = undefined;
    while (true) {
        const n = socketRecv(stream, &chunk) catch |err| switch (err) {
            error.WouldBlock => break,
            else => return err,
        };
        if (n == 0) break;
        try buf.appendSlice(allocator, chunk[0..n]);
        if (buf.items.len > MAX_REQUEST_SIZE) return error.RequestTooLarge;

        // Check if we have the full request
        const raw = buf.items;
        const sep = "\r\n\r\n";
        const header_end = std.mem.indexOf(u8, raw, sep) orelse continue;
        const body_start = header_end + sep.len;

        const cl_raw = extractHeader(raw[0..body_start], "Content-Length") orelse {
            // No content-length → headers-only request is complete
            break;
        };
        const cl = std.fmt.parseInt(usize, std.mem.trim(u8, cl_raw, " \t"), 10) catch break;
        if (raw.len >= body_start + cl) break;
    }
    return buf.toOwnedSlice(allocator);
}

// ── JSON escape helper ──────────────────────────────────────────

fn appendJsonString(out: *std.ArrayListUnmanaged(u8), allocator: std.mem.Allocator, s: []const u8) !void {
    try out.append(allocator, '"');
    for (s) |c| {
        switch (c) {
            '"' => try out.appendSlice(allocator, "\\\""),
            '\\' => try out.appendSlice(allocator, "\\\\"),
            '\n' => try out.appendSlice(allocator, "\\n"),
            '\r' => try out.appendSlice(allocator, "\\r"),
            '\t' => try out.appendSlice(allocator, "\\t"),
            // Other ASCII control characters (excluding the ones handled above)
            0x00...0x08, 0x0b...0x0c, 0x0e...0x1f => {
                var esc: [6]u8 = undefined;
                _ = std.fmt.bufPrint(&esc, "\\u{x:0>4}", .{c}) catch {};
                try out.appendSlice(allocator, &esc);
            },
            else => try out.append(allocator, c),
        }
    }
    try out.append(allocator, '"');
}

// ── API handlers ────────────────────────────────────────────────

fn handleStatus(allocator: std.mem.Allocator) ![]u8 {
    var cfg = Config.load(allocator) catch {
        return allocator.dupe(u8, "{\"configured\":false,\"first_time\":true}");
    };
    defer cfg.deinit();

    var out: std.ArrayListUnmanaged(u8) = .empty;
    errdefer out.deinit(allocator);

    try out.appendSlice(allocator, "{\"configured\":true,\"first_time\":false,\"provider\":");
    try appendJsonString(&out, allocator, cfg.default_provider);
    if (cfg.default_model) |m| {
        try out.appendSlice(allocator, ",\"model\":");
        try appendJsonString(&out, allocator, m);
    }
    if (cfg.agent_name) |name| {
        try out.appendSlice(allocator, ",\"agent_name\":");
        try appendJsonString(&out, allocator, name);
    }
    if (cfg.user_name) |name| {
        try out.appendSlice(allocator, ",\"user_name\":");
        try appendJsonString(&out, allocator, name);
    }
    try out.append(allocator, '}');
    return out.toOwnedSlice(allocator);
}

const GatewayObservedToolEventKind = enum { start, result };

const GatewayObservedToolEvent = struct {
    seq: u64,
    kind: GatewayObservedToolEventKind,
    tool: []u8,
    success: bool = false,
};

const GatewayTurnToolEvent = struct {
    kind: GatewayObservedToolEventKind,
    tool: []const u8,
    success: bool = false,
};

const MAX_OBSERVED_TOOL_EVENTS: usize = 512;

const GatewayThreadObserver = struct {
    allocator: std.mem.Allocator,
    mutex: std.Thread.Mutex = .{},
    next_seq: u64 = 0,
    events: std.ArrayListUnmanaged(GatewayObservedToolEvent) = .empty,

    const vtable = observability_mod.Observer.VTable{
        .record_event = recordEvent,
        .record_metric = recordMetric,
        .flush = flush,
        .name = name,
    };

    pub fn init(allocator: std.mem.Allocator) GatewayThreadObserver {
        return .{ .allocator = allocator };
    }

    pub fn deinit(self: *GatewayThreadObserver) void {
        self.mutex.lock();
        defer self.mutex.unlock();
        for (self.events.items) |event| {
            self.allocator.free(event.tool);
        }
        self.events.deinit(self.allocator);
    }

    pub fn observer(self: *GatewayThreadObserver) observability_mod.Observer {
        return .{
            .ptr = @ptrCast(self),
            .vtable = &vtable,
        };
    }

    pub fn currentSeq(self: *GatewayThreadObserver) u64 {
        self.mutex.lock();
        defer self.mutex.unlock();
        return self.next_seq;
    }

    pub fn collectSince(
        self: *GatewayThreadObserver,
        allocator: std.mem.Allocator,
        seq: u64,
    ) ![]GatewayTurnToolEvent {
        self.mutex.lock();
        defer self.mutex.unlock();

        var count: usize = 0;
        for (self.events.items) |event| {
            if (event.seq > seq) count += 1;
        }

        const out = try allocator.alloc(GatewayTurnToolEvent, count);
        errdefer allocator.free(out);
        var out_idx: usize = 0;
        errdefer {
            for (out[0..out_idx]) |event| {
                allocator.free(event.tool);
            }
        }
        for (self.events.items) |event| {
            if (event.seq <= seq) continue;

            out[out_idx] = .{
                .kind = event.kind,
                .tool = try allocator.dupe(u8, event.tool),
                .success = event.success,
            };
            out_idx += 1;
        }

        return out;
    }

    fn recordEvent(ptr: *anyopaque, event: *const observability_mod.ObserverEvent) void {
        const self: *GatewayThreadObserver = @ptrCast(@alignCast(ptr));
        switch (event.*) {
            .tool_call_start => |e| self.appendEvent(.start, e.tool, false),
            .tool_call => |e| self.appendEvent(.result, e.tool, e.success),
            else => {},
        }
    }

    fn recordMetric(_: *anyopaque, _: *const observability_mod.ObserverMetric) void {}
    fn flush(_: *anyopaque) void {}
    fn name(_: *anyopaque) []const u8 {
        return "gateway_thread";
    }

    fn appendEvent(
        self: *GatewayThreadObserver,
        kind: GatewayObservedToolEventKind,
        tool: []const u8,
        success: bool,
    ) void {
        self.mutex.lock();
        defer self.mutex.unlock();

        const owned_tool = self.allocator.dupe(u8, tool) catch return;

        self.next_seq += 1;
        self.events.append(self.allocator, .{
            .seq = self.next_seq,
            .kind = kind,
            .tool = owned_tool,
            .success = success,
        }) catch {
            self.allocator.free(owned_tool);
            return;
        };

        while (self.events.items.len > MAX_OBSERVED_TOOL_EVENTS) {
            const oldest = self.events.orderedRemove(0);
            self.allocator.free(oldest.tool);
        }
    }
};

fn buildThreadEventsJson(
    allocator: std.mem.Allocator,
    tool_events: []const GatewayTurnToolEvent,
) ![]u8 {
    var buf: std.ArrayListUnmanaged(u8) = .empty;
    errdefer buf.deinit(allocator);
    const w = buf.writer(allocator);

    try w.writeByte('[');

    var tool_results: usize = 0;
    var failed_results: usize = 0;
    var first = true;
    for (tool_events) |event| {
        if (event.kind != .result) continue;
        tool_results += 1;
        if (!event.success) failed_results += 1;

        if (!first) {
            try w.writeByte(',');
        } else {
            first = false;
        }

        try w.writeAll("{\"type\":\"tool_execution\",\"tool\":\"");
        try w.writeAll(event.tool); // Should escape, but for known tools it's fine
        try w.writeAll("\",\"success\":");
        try w.writeAll(if (event.success) "true" else "false");
        try w.writeAll("}");
    }

    if (tool_results > 0) {
        if (!first) try w.writeAll(",");
        try w.writeAll("{\"type\":\"tool_summary\",\"total\":");
        try w.print("{d}", .{tool_results});
        try w.writeAll(",\"failed\":");
        try w.print("{d}", .{failed_results});
        try w.writeByte('}');
    }

    try w.writeByte(']');
    return buf.toOwnedSlice(allocator);
}

fn handleProviders(allocator: std.mem.Allocator) ![]u8 {
    const no_key_providers = [_][]const u8{
        "ollama", "lm-studio", "lmstudio", "claude-cli", "codex-cli", "gemini-cli", "openai-codex",
    };
    var out: std.ArrayListUnmanaged(u8) = .empty;
    errdefer out.deinit(allocator);
    try out.appendSlice(allocator, "{\"providers\":[");
    var first = true;
    for (onboard.known_providers) |p| {
        if (!first) try out.append(allocator, ',');
        first = false;
        const needs_key = blk: {
            for (no_key_providers) |np| {
                if (std.mem.eql(u8, p.key, np)) break :blk false;
            }
            break :blk true;
        };
        try out.appendSlice(allocator, "{\"key\":");
        try appendJsonString(&out, allocator, p.key);
        try out.appendSlice(allocator, ",\"label\":");
        try appendJsonString(&out, allocator, p.label);
        try out.appendSlice(allocator, ",\"needs_api_key\":");
        try out.appendSlice(allocator, if (needs_key) "true" else "false");
        try out.appendSlice(allocator, ",\"default_model\":");
        try appendJsonString(&out, allocator, p.default_model);
        try out.append(allocator, '}');
    }
    try out.appendSlice(allocator, "]}");
    return out.toOwnedSlice(allocator);
}

fn handleSetup(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const SetupReq = struct {
        provider: []const u8 = "anthropic",
        api_key: ?[]const u8 = null,
        model: ?[]const u8 = null,
        user_name: ?[]const u8 = null,
        agent_name: ?[]const u8 = null,
    };
    const parsed = std.json.parseFromSlice(SetupReq, allocator, body, .{
        .ignore_unknown_fields = true,
    }) catch {
        return allocator.dupe(u8, "{\"error\":\"invalid JSON\"}");
    };
    defer parsed.deinit();
    const req = parsed.value;

    onboard.runQuickSetup(allocator, req.api_key, req.provider, req.model, null, req.user_name, req.agent_name) catch |err| {
        var out: std.ArrayListUnmanaged(u8) = .empty;
        errdefer out.deinit(allocator);
        try out.appendSlice(allocator, "{\"error\":");
        const msg = @errorName(err);
        try appendJsonString(&out, allocator, msg);
        try out.append(allocator, '}');
        return out.toOwnedSlice(allocator);
    };

    return allocator.dupe(u8, "{\"ok\":true}");
}

// ── Agent invocation ────────────────────────────────────────────

const HistoryEntry = struct {
    role: []const u8,
    content: []const u8,
};

const ChatReq = struct {
    message: []const u8,
    history: []const HistoryEntry = &.{},
};

fn runAgentTurn(
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

    var noop_obs = observability_mod.NoopObserver{};
    const obs_ptr = if (runtime_observer) |ro| ro.observer() else noop_obs.observer();

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
}

// ── Handlers ────────────────────────────────────────────────────


fn handleSkillsList(allocator: std.mem.Allocator) ![]u8 {
    var cfg = try Config.load(allocator);
    defer cfg.deinit();

    const skills = try skills_mod.listSkills(allocator, cfg.workspace_dir);
    defer skills_mod.freeSkills(allocator, skills);

    var out: std.ArrayListUnmanaged(u8) = .empty;
    errdefer out.deinit(allocator);

    try out.append(allocator, '[');
    for (skills, 0..) |skill, i| {
        if (i > 0) try out.append(allocator, ',');
        try out.appendSlice(allocator, "{\"name\":");
        try appendJsonString(&out, allocator, skill.name);
        try out.appendSlice(allocator, ",\"version\":");
        try appendJsonString(&out, allocator, skill.version);
        try out.appendSlice(allocator, ",\"description\":");
        try appendJsonString(&out, allocator, skill.description);
        try out.append(allocator, '}');
    }
    try out.append(allocator, ']');

    return out.toOwnedSlice(allocator);
}

fn handleClawHubInstall(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const Req = struct { source: []const u8 };
    const parsed = std.json.parseFromSlice(Req, allocator, body, .{ .ignore_unknown_fields = true }) catch return allocator.dupe(u8, "{\"error\":\"invalid json\"}");
    defer parsed.deinit();

    var cfg = try Config.load(allocator);
    defer cfg.deinit();

    const is_windows = builtin.os.tag == .windows;
    const npx_cmd = if (is_windows) "npx.cmd" else "npx";
    
    const argv = &[_][]const u8{ npx_cmd, "--yes", "clawhub", "install", parsed.value.source, "--workdir", cfg.workspace_dir };
    const res = std.process.Child.run(.{
        .allocator = allocator,
        .argv = argv,
    }) catch |err| {
        var out: std.ArrayListUnmanaged(u8) = .empty;
        try out.appendSlice(allocator, "{\"error\":");
        try appendJsonString(&out, allocator, @errorName(err));
        try out.append(allocator, '}');
        return out.toOwnedSlice(allocator);
    };
    defer {
        allocator.free(res.stdout);
        allocator.free(res.stderr);
    }
    
    if (res.term != .Exited or res.term.Exited != 0) {
        var out: std.ArrayListUnmanaged(u8) = .empty;
        try out.appendSlice(allocator, "{\"error\":");
        const msg = if (res.stderr.len > 0) res.stderr else "CLI execution failed";
        try appendJsonString(&out, allocator, std.mem.trim(u8, msg, "\r\n\t "));
        try out.append(allocator, '}');
        return out.toOwnedSlice(allocator);
    }

    return allocator.dupe(u8, "{\"status\":\"ok\"}");
}

fn handleClawHubRemove(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    const Req = struct { name: []const u8 };
    const parsed = std.json.parseFromSlice(Req, allocator, body, .{ .ignore_unknown_fields = true }) catch return allocator.dupe(u8, "{\"error\":\"invalid json\"}");
    defer parsed.deinit();

    var cfg = try Config.load(allocator);
    defer cfg.deinit();

    try skills_mod.removeSkill(allocator, parsed.value.name, cfg.workspace_dir);

    return allocator.dupe(u8, "{\"status\":\"ok\"}");
}

fn getQueryParam(url: []const u8, name: []const u8) ?[]const u8 {
    const qmark = std.mem.indexOfScalar(u8, url, '?') orelse return null;
    const query = url[qmark + 1 ..];
    var it = std.mem.splitScalar(u8, query, '&');
    while (it.next()) |pair| {
        if (std.mem.startsWith(u8, pair, name) and pair.len > name.len and pair[name.len] == '=') {
            return pair[name.len + 1 ..];
        }
    }
    return null;
}


fn dispatch(allocator: std.mem.Allocator, stream: *std.net.Stream, raw: []const u8) void {
    const first_line_end = std.mem.indexOf(u8, raw, "\r\n") orelse return;
    const first_line = raw[0..first_line_end];
    var parts = std.mem.splitScalar(u8, first_line, ' ');
    const method = parts.next() orelse return;
    const target = parts.next() orelse return;
    const path = if (std.mem.indexOfScalar(u8, target, '?')) |qi| target[0..qi] else target;

    // Handle CORS preflight
    if (std.mem.eql(u8, method, "OPTIONS")) {
        writeJson(stream, "204 No Content", "");
        return;
    }

    const is_get = std.mem.eql(u8, method, "GET");
    const is_post = std.mem.eql(u8, method, "POST");

    if (is_get and std.mem.eql(u8, path, "/")) {
        writeResponse(stream, "200 OK", CONTENT_TYPE_HTML, HTML);
        return;
    }

    if (is_get and std.mem.eql(u8, path, "/api/status")) {
        const body = handleStatus(allocator) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(body);
        writeJson(stream, "200 OK", body);
        return;
    }

    if (is_get and std.mem.eql(u8, path, "/api/providers")) {
        const body = handleProviders(allocator) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(body);
        writeJson(stream, "200 OK", body);
        return;
    }

    if (is_post and std.mem.eql(u8, path, "/api/setup")) {
        const req_body = extractBody(raw) orelse "";
        const resp = handleSetup(allocator, req_body) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(resp);
        writeJson(stream, "200 OK", resp);
        return;
    }

    if (is_post and std.mem.eql(u8, path, "/api/chat")) {
        const req_body = extractBody(raw) orelse "";
        const resp = handleChat(allocator, req_body) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(resp);
        writeJson(stream, "200 OK", resp);
        return;
    }

    if (is_get and std.mem.eql(u8, path, "/api/skills/list")) {
        const body = handleSkillsList(allocator) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(body);
        writeJson(stream, "200 OK", body);
        return;
    }

    if (is_post and std.mem.eql(u8, path, "/api/clawhub/install")) {
        const req_body = extractBody(raw) orelse "";
        const resp = handleClawHubInstall(allocator, req_body) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(resp);
        writeJson(stream, "200 OK", resp);
        return;
    }

    if (is_post and std.mem.eql(u8, path, "/api/clawhub/remove")) {
        const req_body = extractBody(raw) orelse "";
        const resp = handleClawHubRemove(allocator, req_body) catch return writeJson(stream, "500 Internal Server Error", "{\"error\":\"internal\"}");
        defer allocator.free(resp);
        writeJson(stream, "200 OK", resp);
        return;
    }

    writeJson(stream, "404 Not Found", "{\"error\":\"not found\"}");
}

// ── Entry point ─────────────────────────────────────────────────

fn serverLoop(server: *std.net.Server, allocator: std.mem.Allocator) void {
    // Accept loop
    while (true) {
        var conn = server.accept() catch break;
        defer conn.stream.close();

        var arena = std.heap.ArenaAllocator.init(allocator);
        defer arena.deinit();
        const req_alloc = arena.allocator();

        const raw = readRequest(req_alloc, &conn.stream) catch continue;
        dispatch(req_alloc, &conn.stream, raw);
    }
}

pub fn run(allocator: std.mem.Allocator) !void {
    // Find an available port starting at DEFAULT_PORT
    var port: u16 = DEFAULT_PORT;
    var server: std.net.Server = blk: {
        var attempts: u8 = 0;
        while (attempts < 10) : (attempts += 1) {
            const addr = std.net.Address.parseIp4("127.0.0.1", port) catch return error.AddressParseFailed;
            const s = addr.listen(.{ .reuse_address = true }) catch {
                port += 1;
                continue;
            };
            break :blk s;
        }
        return error.NoPortAvailable;
    };
    defer server.deinit();

    var url_buf: [32]u8 = undefined;
    const url = std.fmt.bufPrint(&url_buf, "http://127.0.0.1:{d}", .{port}) catch "http://127.0.0.1:7280";

    const server_thread = try std.Thread.spawn(.{}, serverLoop, .{ &server, allocator });
    server_thread.detach();

    var wv = webview.WebView.create(false, null);
    defer wv.destroy() catch |err| { std.log.err("{}", .{err}); };

    wv.setTitle("KrustyKlaw") catch |err| { std.log.err("{}", .{err}); };
    wv.setSize(1024, 768, webview.WebView.WindowSizeHint.none) catch |err| { std.log.err("{}", .{err}); };

    const url_z = try allocator.dupeZ(u8, url);
    defer allocator.free(url_z);
    wv.navigate(url_z) catch |err| { std.log.err("{}", .{err}); };
    wv.run() catch |err| { std.log.err("{}", .{err}); };
}
