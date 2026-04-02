# KrustyKlaw

KrustyKlaw is a simple desktop application built with Zig. Build it with `zig build`, and the executable will appear in `zig-out`.

## Build

```nullclaw/README.md#L8-12
zig build
```

## Run

After building, run the executable from `zig-out` (the exact name depends on your platform).

## CI/CD

Two workflows run in GitHub Actions:

**CI** (`.github/workflows/ci.yml`) — runs on every push and pull request to `main`:
- Builds `ReleaseSmall` on Ubuntu (x86_64), macOS (aarch64), and Windows (x86_64)
- Installs GTK/WebKit system libraries on Linux
- Caches `.zig-cache` keyed on source files
- Reports binary size in the job summary
- Uploads the binary as an artifact

**Release** (`.github/workflows/release.yml`) — runs when a `v*.*` tag is pushed:
- Runs the same three-platform build and packages each binary (`.tar.gz`, `.dmg`, `.zip`)
- Creates a GitHub Release with the packages and a SHA-256 checksum file
- Commits the release artifacts to the `binaries` branch (orphan, no source history)

### Releasing

See [RELEASING.md](RELEASING.md) for the full step-by-step process. The short version:

```bash
git checkout main && git pull
git checkout -b release/vYYYY.M.D
# bump .version in build.zig.zon
git add build.zig.zon && git commit -m "vYYYY.M.D"
git tag vYYYY.M.D
git push origin release/vYYYY.M.D --tags
# open a PR once CI passes
```

The tag triggers the release workflow. If a build fails, fix it on the branch, then move the tag:

```bash
git tag -f vYYYY.M.D
git push origin release/vYYYY.M.D --tags --force
```

To delete a bad tag from both local and remote:

```bash
git tag -d vBAD
git push origin :refs/tags/vBAD
```

## Notes

- Frontend assets live in `src/assets`.
- This project targets Zig `0.15.2`.