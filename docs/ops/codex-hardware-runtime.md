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
| Codex shims | `%USERPROFILE%\.codex\hardware-bin` |

Repair command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\codex-hardware-path.ps1
```

The script installs `node.cmd`, `corepack.cmd`, and `pnpm.cmd` shims into the
stable Codex hardware shim directory and prepends that directory, system Node,
and the npm shim directory to the user PATH. When Codex has an active
`%USERPROFILE%\.codex\tmp\arg0\codex-arg*` shim directory on PATH, the script
also mirrors the shims there so the current session can verify without a
restart.

Validation:

```powershell
node -v
corepack --version
pnpm -v
pnpm --filter @holoscript/snn-webgpu run build
```
