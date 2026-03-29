const std = @import("std");
const builtin = @import("builtin");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const is_wasi = target.result.os.tag == .wasi;
    const is_static = b.option(bool, "static", "Static build") orelse false;
    const enable_embedded_wasm3 = b.option(bool, "embedded_wasm3", "Embed wasm3 runtime (default: true)") orelse true;
    const app_version = b.option([]const u8, "version", "Version string") orelse "dev";

    // Dependencies
    const websocket_dep = b.dependency("websocket", .{ .target = target, .optimize = optimize });
    const webview_dep = b.dependency("webview", .{ .target = target, .optimize = optimize });
    const webview_lib = webview_dep.artifact("webviewStatic");
    
    // SQLite (using package manager dependency)
    const sqlite3_dep = b.dependency("sqlite3", .{ .target = target, .optimize = optimize });
    const sqlite3_lib = sqlite3_dep.artifact("sqlite3");
    sqlite3_lib.root_module.addCMacro("SQLITE_ENABLE_FTS5", "1");

    // Build Options
    var options = b.addOptions();
    options.addOption([]const u8, "version", app_version);
    options.addOption(bool, "enable_memory_none", true);
    options.addOption(bool, "enable_memory_markdown", true);
    options.addOption(bool, "enable_memory_memory", true);
    options.addOption(bool, "enable_memory_api", true);
    options.addOption(bool, "enable_sqlite", true);
    options.addOption(bool, "enable_memory_sqlite", true);
    options.addOption(bool, "enable_embedded_wasm3", enable_embedded_wasm3);
    // Add placeholders if needed for your code to compile
    options.addOption(bool, "enable_postgres", false);
    options.addOption(bool, "enable_memory_lucid", false);
    options.addOption(bool, "enable_memory_redis", false);
    options.addOption(bool, "enable_memory_lancedb", false);
    options.addOption(bool, "enable_memory_clickhouse", false);
    options.addOption(bool, "enable_channel_cli", true);
    options.addOption(bool, "enable_channel_telegram", true);
    options.addOption(bool, "enable_channel_discord", true);
    options.addOption(bool, "enable_channel_slack", true);
    options.addOption(bool, "enable_channel_whatsapp", true);
    options.addOption(bool, "enable_channel_teams", true);
    options.addOption(bool, "enable_channel_matrix", true);
    options.addOption(bool, "enable_channel_mattermost", true);
    options.addOption(bool, "enable_channel_irc", true);
    options.addOption(bool, "enable_channel_imessage", true);
    options.addOption(bool, "enable_channel_email", true);
    options.addOption(bool, "enable_channel_lark", true);
    options.addOption(bool, "enable_channel_dingtalk", true);
    options.addOption(bool, "enable_channel_wechat", true);
    options.addOption(bool, "enable_channel_wecom", true);
    options.addOption(bool, "enable_channel_line", true);
    options.addOption(bool, "enable_channel_onebot", true);
    options.addOption(bool, "enable_channel_qq", true);
    options.addOption(bool, "enable_channel_maixcam", true);
    options.addOption(bool, "enable_channel_signal", true);
    options.addOption(bool, "enable_channel_nostr", true);
    options.addOption(bool, "enable_channel_web", true);
    options.addOption(bool, "enable_channel_max", true);

    const options_mod = options.createModule();

    // Main Module
    const lib_mod = b.addModule("krustyklaw", .{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    lib_mod.addImport("build_options", options_mod);
    lib_mod.linkLibrary(sqlite3_lib);
    lib_mod.addImport("websocket", websocket_dep.module("websocket"));
    lib_mod.addImport("webview", webview_dep.module("webview"));
    lib_mod.linkLibrary(webview_lib);

    if (enable_embedded_wasm3) {
        const wasm3_dep = b.dependency("wasm3", .{ .target = target, .optimize = optimize });
        lib_mod.addIncludePath(wasm3_dep.path("source"));
        lib_mod.linkLibrary(wasm3_dep.artifact("wasm3"));
    }

    // Executable
    const exe = b.addExecutable(.{
        .name = "krustyklaw",
        .root_module = b.createModule(.{
            .root_source_file = if (is_wasi) b.path("src/main_wasi.zig") else b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "krustyklaw", .module = lib_mod },
                .{ .name = "build_options", .module = options_mod },
                .{ .name = "webview", .module = webview_dep.module("webview") },
            },
        }),
        .linkage = if (is_static) .static else .dynamic,
    });
    
    exe.linkLibrary(webview_lib);
    exe.linkLibrary(sqlite3_lib);
    
    // Platform-specific Frameworks/SDKs (Zig 0.15 handles paths natively)
    if (target.result.os.tag == .macos) {
        exe.linkFramework("WebKit");
    }
    
    if (optimize != .Debug) {
        exe.root_module.strip = true;
    }

    // On Windows, suppress the console window so double-clicking the EXE
    // opens only the WebView GUI with no terminal.
    if (target.result.os.tag == .windows) {
        exe.subsystem = .Windows;
    }

    b.installArtifact(exe);

    // Run step
    const run_cmd = b.addRunArtifact(exe);
    b.step("run", "Run the app").dependOn(&run_cmd.step);
}
