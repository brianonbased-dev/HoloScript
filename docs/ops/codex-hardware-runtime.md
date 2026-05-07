# Codex Hardware Runtime

Codex Desktop may place a WindowsApps-packaged `node.exe` ahead of the real
runtime. On this host that alias is not executable from the hardware shell, so
plain `node`, `pnpm`, and `corepack` can fail even though the system runtime is
installed.

Canonical runtime for this machine:

| Tool | Path |
| ---- | ---- |
| Node.js | `C:\Program Files\nodejs\node.exe` |
| Corepack | `C:\Program Files\nodejs\corepack.cmd` |
| pnpm shim | `%APPDATA%\npm\pnpm.cmd` |
| node-gyp Python | Python 3.12 or 3.11 with `setuptools`/`distutils` |
| Codex shims | `%USERPROFILE%\.codex\hardware-bin` |

Repair command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\codex-hardware-path.ps1
```

The script installs both PowerShell/CMD shims (`node.cmd`, `corepack.cmd`,
`pnpm.cmd`) and Git Bash shims (`node`, `corepack`, `pnpm`) into the stable Codex
hardware shim directory. It prepends that directory, system Node, and the npm
shim directory to the user PATH. When Codex has an active
`%USERPROFILE%\.codex\tmp\arg0\codex-arg*` shim directory on PATH, the script
also mirrors the shims there so the current session can verify without a
restart and so Git hooks resolve the same runtime.

The `pnpm` and `corepack` shims also export `npm_config_python` to a local
Python 3.12 or 3.11 executable that can import `setuptools` and `distutils`.
This keeps native dependency rebuilds deterministic when Codex is running a
newer Node line and packages such as `better-sqlite3` fall back to `node-gyp`.

Validation:

```powershell
node -v
corepack --version
pnpm -v
pnpm config get python
pnpm --filter @holoscript/snn-webgpu run build
```
