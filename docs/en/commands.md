# Commands

This page groups the KrustyKlaw CLI by task so you can find the right command quickly without scanning the full help output.

`krustyklaw help` gives the top-level summary; this page stays aligned with it and expands into the detailed subcommands and notes.

## Page Guide

**Who this page is for**

- Users who already have KrustyKlaw installed and need the right CLI entry point
- Operators checking runtime, service, channel, or diagnostic commands
- Contributors verifying command names, flags, and task groupings

**Read this next**

- Open [Configuration](./configuration.md) if you need to understand what the commands act on
- Open [Usage and Operations](./usage.md) if you want workflows instead of command listings
- Open [Development](./development.md) if you are changing CLI behavior or docs

**If you came from ...**

- [README](./README.md): this page is the fastest way to find a concrete command
- [Installation](./installation.md): after setup, use this page to validate the install and learn daily commands
- `krustyklaw help`: use this page when the built-in help is correct but too terse

## Start with these

- Show help: `krustyklaw help`
- Show version: `krustyklaw version` or `krustyklaw --version`
- First-time setup: `krustyklaw onboard --interactive`
- Quick validation: `krustyklaw agent -m "hello"`
- Long-running mode: `krustyklaw gateway`

## Setup and interaction

| Command | Purpose |
|---|---|
| `krustyklaw help` | Show top-level help |
| `krustyklaw version` / `krustyklaw --version` | Show CLI version |
| `krustyklaw onboard --interactive` | Run the interactive setup wizard |
| `krustyklaw onboard --api-key sk-... --provider openrouter` | Quick provider + API key setup |
| `krustyklaw onboard --api-key ... --provider ... --model ... --memory ...` | Set provider, model, and memory backend in one command |
| `krustyklaw onboard --channels-only` | Reconfigure channels and allowlists only |
| `krustyklaw agent -m "..."` | Run a single prompt |
| `krustyklaw agent` | Start interactive chat mode |

### Interactive model routing

- In `krustyklaw agent`, `/model` shows the current model plus configured routing/fallback status.
- `/config reload` hot reloads supported keys from `config.json` (including agent profiles).
- When auto-routing is configured, `/model` also shows the last auto-route decision and why it was chosen.
- If a routed provider is temporarily rate-limited or out of credits, `/model` shows that route as degraded until its cooldown expires.
- `/model` also lists configured auto routes with their `cost_class` and `quota_class` metadata.
- `/model <provider/model>` pins the current session to that model and disables automatic routing.
- `/model auto` clears the user pin, restores the configured default model, and re-enables `model_routes` for later turns in the same session.
- If no `model_routes` are configured, `/model auto` still clears the pin and returns the session to the configured default model.
- Starting `krustyklaw agent` with `--model` or `--provider` also pins the run and bypasses `model_routes`.

## Runtime and operations

| Command | Purpose |
|---|---|
| `krustyklaw gateway` | Start the long-running runtime using configured host and port |
| `krustyklaw gateway --port 8080` | Override the gateway port from the CLI |
| `krustyklaw gateway --host 0.0.0.0 --port 8080` | Override host and port from the CLI |
| `krustyklaw service install` | Install the background service |
| `krustyklaw service start` | Start the background service |
| `krustyklaw service stop` | Stop the background service |
| `krustyklaw service restart` | Restart the background service |
| `krustyklaw service status` | Show service status |
| `krustyklaw service uninstall` | Remove the background service |
| `krustyklaw status` | Show overall system status |
| `krustyklaw doctor` | Run diagnostics |
| `krustyklaw update --check` | Check for updates without installing |
| `krustyklaw update --yes` | Install updates without prompting |
| `krustyklaw auth login openai-codex` | Authenticate `openai-codex` via OAuth device flow |
| `krustyklaw auth login openai-codex --import-codex` | Import auth from `~/.codex/auth.json` |
| `krustyklaw auth status openai-codex` | Show authentication state |
| `krustyklaw auth logout openai-codex` | Remove stored credentials |

Notes:

- `auth` currently supports only `openai-codex`.
- `gateway --host/--port` overrides only the bind settings; the rest of gateway security still comes from config.

## Channels, scheduling, and extensions

### `channel`

| Command | Purpose |
|---|---|
| `krustyklaw channel list` | List known and configured channels |
| `krustyklaw channel start` | Start the default available channel |
| `krustyklaw channel start telegram` | Start a specific channel |
| `krustyklaw channel status` | Show channel health |
| `krustyklaw channel add <type>` | Print guidance for adding a channel to config |
| `krustyklaw channel remove <name>` | Print guidance for removing a channel from config |

### `cron`

| Command | Purpose |
|---|---|
| `krustyklaw cron list` | List scheduled tasks |
| `krustyklaw cron add "0 * * * *" "command"` | Add a recurring shell task |
| `krustyklaw cron add-agent "0 * * * *" "prompt" --model <model> [--announce] [--channel <name>] [--account <id>] [--to <id>]` | Add a recurring agent task |
| `krustyklaw cron once 10m "command"` | Add a one-shot delayed shell task |
| `krustyklaw cron once-agent 10m "prompt" --model <model>` | Add a one-shot delayed agent task |
| `krustyklaw cron run <id>` | Run a task immediately |
| `krustyklaw cron pause <id>` / `resume <id>` | Pause or resume a task |
| `krustyklaw cron remove <id>` | Delete a task |
| `krustyklaw cron runs <id>` | Show recent run history |
| `krustyklaw cron update <id> --expression ... --command ... --prompt ... --model ... --enable/--disable` | Update an existing task |

### `skills`

| Command | Purpose |
|---|---|
| `krustyklaw skills list` | List installed skills |
| `krustyklaw skills install <source>` | Install from a GitHub URL or local path |
| `krustyklaw skills remove <name>` | Remove a skill |
| `krustyklaw skills info <name>` | Show skill metadata |

### `history`

| Command | Purpose |
|---|---|
| `krustyklaw history list [--limit N] [--offset N] [--json]` | List conversation sessions |
| `krustyklaw history show <session_id> [--limit N] [--offset N] [--json]` | Show messages for a session |

## Data, models, and workspace

### `memory`

| Command | Purpose |
|---|---|
| `krustyklaw memory stats` | Show resolved memory config and counters |
| `krustyklaw memory count` | Show total number of memory entries |
| `krustyklaw memory reindex` | Rebuild the vector index |
| `krustyklaw memory search "query" --limit 10` | Run retrieval against memory |
| `krustyklaw memory get <key>` | Show one memory entry |
| `krustyklaw memory list --category task --limit 20` | List memory entries by category |
| `krustyklaw memory drain-outbox` | Drain the durable vector outbox queue |
| `krustyklaw memory forget <key>` | Delete one memory entry |

### `workspace`, `capabilities`, `models`, `migrate`

| Command | Purpose |
|---|---|
| `krustyklaw workspace edit AGENTS.md` | Open a bootstrap markdown file in `$EDITOR` |
| `krustyklaw workspace reset-md --dry-run` | Preview workspace markdown reset |
| `krustyklaw workspace reset-md --include-bootstrap --clear-memory-md` | Reset bundled markdown files and optionally clear extra files |
| `krustyklaw capabilities` | Show a text capability summary |
| `krustyklaw capabilities --json` | Show a JSON capability manifest |
| `krustyklaw models list` | List providers and default models |
| `krustyklaw models info <model>` | Show model details |
| `krustyklaw models benchmark` | Run model latency benchmark |
| `krustyklaw models refresh` | Refresh the model catalog |
| `krustyklaw migrate openclaw --dry-run` | Preview OpenClaw migration |
| `krustyklaw migrate openclaw --source /path/to/workspace` | Migrate from a specific source workspace |

Notes:

- `workspace edit` works only with file-based backends such as `markdown` and `hybrid`.
- If bootstrap data is stored in the database backend, the CLI will tell you to use the agent's `memory_store` tool instead.

## Hardware and automation-facing entry points

### `hardware`

| Command | Purpose |
|---|---|
| `krustyklaw hardware scan` | Scan connected hardware |
| `krustyklaw hardware flash <firmware_file> [--target <board>]` | Flash firmware to a device (currently a placeholder command) |
| `krustyklaw hardware monitor` | Monitor hardware devices (currently a placeholder command) |

### Top-level machine-facing flags

These are more useful for automation, probing, or integrations than for normal day-to-day CLI use:

| Command | Purpose |
|---|---|
| `krustyklaw --export-manifest` | Export the runtime manifest |
| `krustyklaw --list-models` | Print model information |
| `krustyklaw --probe-provider-health` | Probe provider health |
| `krustyklaw --probe-channel-health` | Probe channel health |
| `krustyklaw --from-json` | Run a JSON-driven entry path |

## Recommended troubleshooting order

1. `krustyklaw doctor`
2. `krustyklaw status`
3. `krustyklaw channel status`
4. `krustyklaw agent -m "self-check"`
5. If gateway is involved, also run `curl http://127.0.0.1:3000/health`

## Next Steps

- Go to [Usage and Operations](./usage.md) for task-based runtime workflows
- Go to [Configuration](./configuration.md) if a command depends on provider, gateway, or memory settings
- Go to [Development](./development.md) if you plan to change command behavior or update docs alongside code

## Related Pages

- [README](./README.md)
- [Installation](./installation.md)
- [Gateway API](./gateway-api.md)
- [Architecture](./architecture.md)
