# Installation

This guide covers the main installation paths for macOS, Linux, and Windows.

## Page Guide

**Who this page is for**

- First-time users installing KrustyKlaw on a local machine
- Operators choosing between package install, container deployment, and source build
- Contributors validating the baseline runtime before deeper setup

**Read this next**

- Open [Configuration](./configuration.md) after the binary is installed and on your `PATH`
- Open [Usage and Operations](./usage.md) when you are ready to run first commands and service mode
- Open [README](./README.md) if you want the broader English docs map before going deeper

**If you came from ...**

- [README](./README.md): this page is the concrete first-run path after choosing the installation track
- [Commands](./commands.md): come here first if the CLI is missing or `krustyklaw --help` does not work yet
- [Development](./development.md): return here if a contributor workflow also needs a clean local binary setup

## Prerequisites

- If building from source, use **Zig 0.15.2**.
- Git (required for source install).

Check Zig version:

```bash
zig version
```

The output must be `0.15.2`.

## Option 1: Homebrew (recommended for macOS/Linux)

```bash
brew install krustyklaw
krustyklaw --help
```

If the command works, installation is complete.

## Option 2: Official Container Image (Docker / Podman)

KrustyKlaw publishes an official OCI image at `ghcr.io/krustyklaw/krustyklaw`.

The container stores its persistent state under `/krustyklaw-data`:

- config: `/krustyklaw-data/config.json`
- workspace: `/krustyklaw-data/workspace`

The bundled starter config already uses the current schema (`agents.defaults.model.primary` plus `models.providers`), so `latest` should boot cleanly before you customize provider credentials.

### Quick one-off commands

```bash
docker run --rm -it \
  -v krustyklaw-data:/krustyklaw-data \
  ghcr.io/krustyklaw/krustyklaw:latest status
```

Initialize config interactively:

```bash
docker run --rm -it \
  -v krustyklaw-data:/krustyklaw-data \
  ghcr.io/krustyklaw/krustyklaw:latest onboard --interactive
```

Run the interactive agent:

```bash
docker run --rm -it \
  -v krustyklaw-data:/krustyklaw-data \
  ghcr.io/krustyklaw/krustyklaw:latest agent
```

Run the HTTP gateway:

```bash
docker run --rm -it \
  -p 127.0.0.1:3000:3000 \
  -v krustyklaw-data:/krustyklaw-data \
  ghcr.io/krustyklaw/krustyklaw:latest
```

### Docker Compose

The repository ships a `docker-compose.yml` that uses the official image by default.

Interactive onboarding:

```bash
docker compose --profile agent run --rm agent onboard --interactive
```

Interactive agent session:

```bash
docker compose --profile agent run --rm agent
```

Long-running gateway:

```bash
docker compose --profile gateway up -d gateway
```

Profile behavior:

- `agent`: one-off interactive CLI container
- `gateway`: long-running HTTP gateway published on host loopback port `3000`

If you need LAN or public exposure, change the published host IP deliberately and review [Security](./security.md) first.

To pin a release tag or switch registries later, override `KRUSTYKLAW_IMAGE`:

```bash
KRUSTYKLAW_IMAGE=ghcr.io/krustyklaw/krustyklaw:v2026.3.11 docker compose --profile gateway up -d gateway
```

## Option 3: Build from Source (cross-platform)

```bash
git clone https://github.com/krustyklaw/krustyklaw.git
cd krustyklaw
zig build -Doptimize=ReleaseSmall
zig build test --summary all
```

Build output:

- `zig-out/bin/krustyklaw`

## Option 4: Android / Termux

There are three different Android / Termux paths:

- download an official pre-built Android / Termux binary from releases
- build directly inside Termux on the Android device
- cross-compile an Android binary from another machine

### Termux native build

```bash
pkg update
pkg install git zig
git clone https://github.com/krustyklaw/krustyklaw.git
cd krustyklaw
zig version
zig build -Doptimize=ReleaseSmall
./zig-out/bin/krustyklaw --help
```

Notes:

- Use **Zig 0.15.2** exactly.
- If `zig build` fails immediately, verify the Zig version first.
- This uses the native target of the current Termux environment, so you usually do **not** need `-Dtarget`.
- On Android / Termux, prefer foreground use first (`agent`, `gateway`) before trying to manage it as a background service.
- Official releases publish pre-built Android / Termux binaries for `aarch64`, `armv7`, and `x86_64`.
- For the fuller Android / Termux path, including troubleshooting, see [Termux Guide](./termux.md).

### Cross-compiling for Android

If you are building on another machine for a Termux / Android device, pass an explicit Zig target and an Android libc/sysroot file. `-Dtarget` alone is not enough:

```bash
zig build -Dtarget=aarch64-linux-android.24 -Doptimize=ReleaseSmall --libc /path/to/android-libc-aarch64.txt
```

Common Android targets:

- `aarch64-linux-android.24`
- `arm-linux-androideabi.24` with `-Dcpu=baseline+v7a`
- `x86_64-linux-android.24`

Use the target that matches the phone or emulator architecture.
See [`.github/workflows/release.yml`](../../.github/workflows/release.yml) for a complete example of generating the `--libc` file from the Android NDK.
Official releases also attach matching Android / Termux binaries built for Android API 24.

## Add binary to PATH

### Compiled binary file

#### macOS/Linux（zsh/bash）

```bash
zig build -Doptimize=ReleaseSmall -p "$HOME/.local"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
# bash users: use ~/.bashrc
source ~/.zshrc
```

#### Windows（PowerShell）

```powershell
zig build -Doptimize=ReleaseSmall -p "$HOME\.local"

$bin = "$HOME\.local\bin"
$user_path = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($user_path -split ";" | Where-Object { $_ -eq $bin })) {
  [Environment]::SetEnvironmentVariable("Path", "$user_path;$bin", "User")
}
$env:Path = "$env:Path;$bin"
```

### Downloaded krustyklaw binary file (Windows,Powershell)
You can rename the downloaded krustyklaw binary file(.exe) to krustyklaw.exe，then run the following commands with administrator privileges in Powershell, that will add the directory which the binary file is located in to Environment Variable PATH in Windows:

```Powershell 
$old = [Environment]::GetEnvironmentVariable("Path", "Machine")
$new = "$old;x:\krustyklaww二进制文件所在目录"
[Environment]::SetEnvironmentVariable("Path", $new, "Machine")
```

## Verify Installation

```bash
krustyklaw --help
krustyklaw --version
krustyklaw status
```

If `status` returns component state successfully, runtime basics are ready.

## Upgrade and Uninstall

### Homebrew（Recommended for macOS/Linux）

- update:
```bash
brew update
brew upgrade krustyklaw
```
- uninstall:
```bash
brew uninstall krustyklaw
```
#### Command line(CMD) (Windows)

- update: `krustyklaw update`

- uninstall: delete the `krustyklaw` binary file and remove the entry of the directory containing the binary file in environment variables PATH if it exists.

### Source install

- Upgrade: `git pull`, then rebuild with `zig build -Doptimize=ReleaseSmall`.
- Uninstall: delete the installed `krustyklaw` binary and remove the PATH entry.

## Next Steps

- Run `krustyklaw onboard --interactive`, then continue with [Configuration](./configuration.md)
- Use [Usage and Operations](./usage.md) for first-run commands, service mode, and troubleshooting
- Keep [Commands](./commands.md) nearby if you want a task-based CLI reference after install

## Related Pages

- [README](./README.md)
- [Termux Guide](./termux.md)
- [Configuration](./configuration.md)
- [Usage and Operations](./usage.md)
- [Commands](./commands.md)
