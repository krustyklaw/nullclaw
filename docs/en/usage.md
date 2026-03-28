# Usage and Operations

This page focuses on day-to-day commands, service mode, and troubleshooting.

## Page Guide

**Who this page is for**

- Users running KrustyKlaw day to day from the CLI or service mode
- Operators checking health, restarts, and post-change validation steps
- Troubleshooters narrowing down common startup, model, channel, or gateway issues

**Read this next**

- Open [Commands](./commands.md) if you need a fuller CLI reference beyond the common paths here
- Open [Security](./security.md) before exposing the gateway or widening allowlists and autonomy
- Open [Gateway API](./gateway-api.md) if your operational flow depends on pairing or webhook calls

**If you came from ...**

- [Installation](./installation.md): this page picks up after the binary is installed and ready for first-run checks
- [Configuration](./configuration.md): come here to validate config changes with runtime commands and troubleshooting steps
- [Commands](./commands.md): return here when you want the operational sequence, not just the raw command list

## First-Run Flow

1. Initialize:

```bash
krustyklaw onboard --interactive
```

2. Send a test message:

```bash
krustyklaw agent -m "hello krustyklaw"
```

3. Start long-running gateway:

```bash
krustyklaw gateway
```

## Command Quick Reference

| Command | Purpose |
|---|---|
| `krustyklaw onboard --api-key sk-... --provider openrouter` | Quick setup for provider and API key |
| `krustyklaw onboard --interactive` | Full interactive setup |
| `krustyklaw onboard --channels-only` | Reconfigure channels and allowlists only |
| `krustyklaw agent -m "..."` | Single-message mode |
| `krustyklaw agent` | Interactive mode |
| `krustyklaw gateway` | Start long-running runtime (default `127.0.0.1:3000`) |
| `krustyklaw service install` | Install background service |
| `krustyklaw service start` | Start background service |
| `krustyklaw service status` | Check service status |
| `krustyklaw service stop` | Stop background service |
| `krustyklaw service uninstall` | Uninstall background service |
| `krustyklaw doctor` | Run diagnostics |
| `krustyklaw status` | Show global status |
| `krustyklaw channel status` | Show channel health |
| `krustyklaw channel start telegram` | Start a specific channel |
| `krustyklaw migrate openclaw --dry-run` | Dry-run OpenClaw migration |
| `krustyklaw migrate openclaw` | Execute OpenClaw migration |
| `krustyklaw history list [--limit N] [--offset N] [--json]` | List conversation sessions |
| `krustyklaw history show <session_id> [--limit N] [--offset N] [--json]` | Show messages for a session |

## Service Mode Recommendations

For long-running deployments:

- macOS uses `launchctl`.
- Linux uses `systemd --user` when available and falls back to OpenRC on Alpine/OpenRC systems.
- Windows uses the Service Control Manager.
- If Linux has neither working `systemd --user` nor the required OpenRC commands, service subcommands fail; use foreground `krustyklaw gateway` or another supervisor instead.

```bash
krustyklaw service install
krustyklaw service start
krustyklaw service status
```

After significant config changes, restart service:

```bash
krustyklaw service stop
krustyklaw service start
```

## Gateway and Pairing

- Default gateway: `127.0.0.1:3000`
- Recommended: keep `gateway.require_pairing = true`
- For public access, prefer tunnel/reverse proxy over direct public bind
- `/pair` is POST-only, uses `X-Pairing-Code`, and can be rate-limited or temporarily locked after repeated invalid attempts

Health check:

```bash
curl http://127.0.0.1:3000/health
```

## FAQ

### 1) Startup fails with config error

Steps:

1. Run `krustyklaw doctor` for exact error details.
2. Compare with `config.example.json` for key names and nesting.
3. Validate JSON syntax (commas, quotes, braces).

### 2) Model calls fail (401/403)

Common causes:

- API key invalid/expired.
- Provider mismatch (for example, wrong key for selected provider).
- Invalid model route format/string.

Checks:

```bash
krustyklaw status
```

Then re-run onboarding:

```bash
krustyklaw onboard --interactive
```

### 3) Channel receives no messages

Check:

- `channels.<name>.accounts.*` token/webhook/account settings.
- `allow_from` accidentally set to empty array.
- `krustyklaw channel status` health output.
- For DingTalk-specific stream and reply-target checks, open
  [DingTalk Ops Readiness](./ops/dingtalk-ops-readiness.md).

### 4) Gateway starts but is unreachable externally

Common causes:

- Still bound to `127.0.0.1`.
- Tunnel/reverse proxy not configured.
- Firewall port not opened.

### 5) Provider returns 429 / "rate limit exceeded"

Common causes:

- Low-quota coding plans may reject tool-heavy agent turns even when plain chat still works.
- Retry pressure is too aggressive for the current provider plan.
- There is no configured fallback when the primary provider hits quota/rate limits.

Checks:

- For foreground runs, start with `krustyklaw agent --verbose`.
- For service mode, inspect `~/.krustyklaw/logs/daemon.stdout.log` and `~/.krustyklaw/logs/daemon.stderr.log`.
- Run `krustyklaw status` to confirm the current provider/model pair.

If the plan is valid but fragile, tune reliability conservatively:

```json
{
  "reliability": {
    "provider_retries": 1,
    "provider_backoff_ms": 3000,
    "fallback_providers": ["openrouter"]
  }
}
```

If you have multiple keys for the same provider, add `reliability.api_keys` so KrustyKlaw can rotate them.

## Post-Change Checklist

After config edits:

```bash
krustyklaw doctor
krustyklaw status
krustyklaw channel status
krustyklaw agent -m "self-check"
```

For gateway scenarios:

```bash
krustyklaw gateway
curl http://127.0.0.1:3000/health
```

## Next Steps

- Open [Commands](./commands.md) for less common CLI flows and a broader command catalog
- Review [Security](./security.md) before moving from local-only operation to wider exposure
- Use [Gateway API](./gateway-api.md) when your operational checks include pairing or webhook integrations

## Related Pages

- [Installation](./installation.md)
- [Configuration](./configuration.md)
- [Commands](./commands.md)
- [Security](./security.md)
