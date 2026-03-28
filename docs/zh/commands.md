# 命令参考

本页按使用场景整理 KrustyKlaw CLI，目标是让你先找到正确命令，再去看更细的输出。

`krustyklaw help` 提供的是顶层摘要；本页与其保持对齐，并继续展开到子命令与注意事项。

## 页面导航

- 这页适合谁：已经准备使用 CLI，但还不确定命令名、子命令或常见入口的人。
- 看完去哪里：首次配置看 [配置指南](./configuration.md)；日常运行和排障看 [使用与运维](./usage.md)；如果你在改 CLI 或文档，去 [开发指南](./development.md)。
- 如果你是从某页来的：从 [README](./README.md) 来，可先看“先看这几条”；从 [安装指南](./installation.md) 来，通常下一步是 `onboard`、`agent` 和 `gateway`；从 [开发指南](./development.md) 来，请把本页当作 CLI 行为和示例索引。

## 先看这几条

- 看总帮助：`krustyklaw help`
- 看版本：`krustyklaw version` 或 `krustyklaw --version`
- 首次初始化：`krustyklaw onboard --interactive`
- 单条对话验证：`krustyklaw agent -m "hello"`
- 长期运行：`krustyklaw gateway`

## 初始化与交互

| 命令 | 说明 |
|---|---|
| `krustyklaw help` | 显示顶层帮助 |
| `krustyklaw version` / `krustyklaw --version` | 查看 CLI 版本 |
| `krustyklaw onboard --interactive` | 交互式初始化配置 |
| `krustyklaw onboard --api-key sk-... --provider openrouter` | 快速写入 provider 与 API Key |
| `krustyklaw onboard --api-key ... --provider ... --model ... --memory ...` | 一次性指定 provider、model、memory backend |
| `krustyklaw onboard --channels-only` | 只重配 channel / allowlist |
| `krustyklaw agent -m "..."` | 单条消息模式 |
| `krustyklaw agent` | 交互会话模式 |

### 交互式模型路由

- 在 `krustyklaw agent` 里，`/model` 会显示当前模型以及已配置的路由/回退状态。
- `/config reload` 会热重载 `config.json` 中支持的配置项（包括 Agent Profile 的更新）。
- 如果配置了自动路由，`/model` 还会显示最近一次自动路由决策以及选择原因。
- 如果某条自动路由命中的提供方暂时被限流或额度耗尽，`/model` 会把这条路线标成 degraded，直到冷却结束。
- `/model` 还会列出已配置的自动路由及其 `cost_class`、`quota_class` 元数据。
- `/model <provider/model>` 会把当前会话 pin 到该模型，并关闭自动路由。
- `/model auto` 会清除这个用户 pin，把会话恢复到配置里的默认模型，并让后续回合重新使用 `model_routes`。
- 如果没有配置 `model_routes`，`/model auto` 仍然会清除 pin，并把会话切回配置里的默认模型。
- 通过 `--model` 或 `--provider` 启动 `krustyklaw agent` 时，也会把该次运行 pin 到显式模型，从而绕过 `model_routes`。

## 运行与运维

| 命令 | 说明 |
|---|---|
| `krustyklaw gateway` | 启动长期运行 runtime，默认读取配置中的 host/port |
| `krustyklaw gateway --port 8080` | 用 CLI 覆盖网关端口 |
| `krustyklaw gateway --host 0.0.0.0 --port 8080` | 用 CLI 覆盖监听地址与端口 |
| `krustyklaw service install` | 安装后台服务 |
| `krustyklaw service start` | 启动后台服务 |
| `krustyklaw service stop` | 停止后台服务 |
| `krustyklaw service restart` | 重启后台服务 |
| `krustyklaw service status` | 查看后台服务状态 |
| `krustyklaw service uninstall` | 卸载后台服务 |
| `krustyklaw status` | 查看全局状态总览 |
| `krustyklaw doctor` | 执行系统诊断 |
| `krustyklaw update --check` | 仅检查是否有更新 |
| `krustyklaw update --yes` | 自动确认并安装更新 |
| `krustyklaw auth login openai-codex` | 为 `openai-codex` 做 OAuth 登录 |
| `krustyklaw auth login openai-codex --import-codex` | 从 `~/.codex/auth.json` 导入登录态 |
| `krustyklaw auth status openai-codex` | 查看认证状态 |
| `krustyklaw auth logout openai-codex` | 删除本地认证信息 |

说明：

- `auth` 目前只支持 `openai-codex`。
- `gateway` 只是覆盖 host/port，其他安全策略仍以配置文件为准。

## 渠道、任务与扩展

### Channel

| 命令 | 说明 |
|---|---|
| `krustyklaw channel list` | 列出已知 / 已配置渠道 |
| `krustyklaw channel start` | 启动默认可用渠道 |
| `krustyklaw channel start telegram` | 启动指定渠道 |
| `krustyklaw channel status` | 查看渠道健康状态 |
| `krustyklaw channel add <type>` | 提示如何往配置里添加某类渠道 |
| `krustyklaw channel remove <name>` | 提示如何从配置里移除渠道 |

### Cron

| 命令 | 说明 |
|---|---|
| `krustyklaw cron list` | 查看所有计划任务 |
| `krustyklaw cron add "0 * * * *" "command"` | 新增周期性 shell 任务 |
| `krustyklaw cron add-agent "0 * * * *" "prompt" --model <model> [--announce] [--channel <name>] [--account <id>] [--to <id>]` | 新增周期性 agent 任务 |
| `krustyklaw cron once 10m "command"` | 新增一次性延迟任务 |
| `krustyklaw cron once-agent 10m "prompt" --model <model>` | 新增一次性 agent 延迟任务 |
| `krustyklaw cron run <id>` | 立即执行指定任务 |
| `krustyklaw cron pause <id>` / `resume <id>` | 暂停 / 恢复任务 |
| `krustyklaw cron remove <id>` | 删除任务 |
| `krustyklaw cron runs <id>` | 查看任务最近执行记录 |
| `krustyklaw cron update <id> --expression ... --command ... --prompt ... --model ... --enable/--disable` | 更新已有任务 |

### Skills

| 命令 | 说明 |
|---|---|
| `krustyklaw skills list` | 列出已安装 skill |
| `krustyklaw skills install <source>` | 从 GitHub URL 或本地路径安装 skill |
| `krustyklaw skills remove <name>` | 移除 skill |
| `krustyklaw skills info <name>` | 查看 skill 元信息 |

### History

| 命令 | 说明 |
|---|---|
| `krustyklaw history list [--limit N] [--offset N] [--json]` | 列出会话记录 |
| `krustyklaw history show <session_id> [--limit N] [--offset N] [--json]` | 查看指定会话的消息详情 |

## 数据、模型与工作区

### Memory

| 命令 | 说明 |
|---|---|
| `krustyklaw memory stats` | 查看当前 memory 配置与关键计数 |
| `krustyklaw memory count` | 查看总条目数 |
| `krustyklaw memory reindex` | 重建向量索引 |
| `krustyklaw memory search "query" --limit 10` | 执行检索 |
| `krustyklaw memory get <key>` | 查看单条 memory |
| `krustyklaw memory list --category task --limit 20` | 按分类列出 memory |
| `krustyklaw memory drain-outbox` | 清空 durable vector outbox 队列 |
| `krustyklaw memory forget <key>` | 删除一条 memory |

### Workspace / Capabilities / Models / Migrate

| 命令 | 说明 |
|---|---|
| `krustyklaw workspace edit AGENTS.md` | 用 `$EDITOR` 打开 bootstrap 文件 |
| `krustyklaw workspace reset-md --dry-run` | 预览将要重置的 markdown prompt 文件 |
| `krustyklaw workspace reset-md --include-bootstrap --clear-memory-md` | 重置 bundled markdown，并可附带清理 bootstrap / memory 文件 |
| `krustyklaw capabilities` | 输出运行时能力摘要 |
| `krustyklaw capabilities --json` | 输出 JSON manifest |
| `krustyklaw models list` | 列出 provider 与默认模型 |
| `krustyklaw models info <model>` | 查看模型说明 |
| `krustyklaw models benchmark` | 运行模型延迟基准 |
| `krustyklaw models refresh` | 刷新模型目录 |
| `krustyklaw migrate openclaw --dry-run` | 预演迁移 OpenClaw |
| `krustyklaw migrate openclaw --source /path/to/workspace` | 指定源工作区路径迁移 |

说明：

- `workspace edit` 只适用于 file-based backend（如 `markdown`、`hybrid`）。
- 如果当前 memory backend 把 bootstrap 数据放在数据库里，CLI 会提示改用 agent 的 `memory_store` 工具，或切回 file-based backend。

## 硬件与自动化集成

| 命令 | 说明 |
|---|---|
| `krustyklaw hardware scan` | 扫描已连接硬件 |
| `krustyklaw hardware flash <firmware_file> [--target <board>]` | 烧录固件（当前输出提示，尚未完整实现） |
| `krustyklaw hardware monitor` | 监控硬件（当前输出提示，尚未完整实现） |

## 顶层 machine-facing flags

这组入口更偏自动化、集成、探针，不是普通用户的第一阅读路径：

| 命令 | 说明 |
|---|---|
| `krustyklaw --export-manifest` | 导出 manifest |
| `krustyklaw --list-models` | 列出模型信息 |
| `krustyklaw --probe-provider-health` | 探测 provider 健康状态 |
| `krustyklaw --probe-channel-health` | 探测 channel 健康状态 |
| `krustyklaw --from-json` | 从 JSON 输入执行特定流程 |

## 推荐的日常排查顺序

1. `krustyklaw doctor`
2. `krustyklaw status`
3. `krustyklaw channel status`
4. `krustyklaw agent -m "self-check"`
5. 如涉及网关，再执行 `curl http://127.0.0.1:3000/health`

## 下一步

- 要把命令真正跑起来：继续看 [配置指南](./configuration.md) 和 [使用与运维](./usage.md)。
- 要部署长期运行：继续看 [使用与运维](./usage.md) 和 [Gateway API](./gateway-api.md)。
- 要修改命令实现或补测试：继续看 [开发指南](./development.md) 和 [架构总览](./architecture.md)。

## 相关页面

- [中文文档入口](./README.md)
- [安装指南](./installation.md)
- [配置指南](./configuration.md)
- [开发指南](./development.md)
