# @holoscript/connector-vscode

Bidirectional bridge between HoloScript Studio and a running VS Code instance. Connects over a local HTTP bridge exposed by the HoloScript VS Code extension, registers 8 MCP tools, and maintains a 15-second heartbeat for automatic reconnection.

## Install

```bash
pnpm add @holoscript/connector-vscode
```

Peer dependency: the HoloScript VS Code extension must be installed and running with its HTTP bridge enabled (default port `17420`).

## Quick start

```ts
import { VSCodeConnector } from '@holoscript/connector-vscode';

const connector = new VSCodeConnector();
await connector.connect();       // discovers extension via bridge health check
await connector.executeTool('vscode_file_open', { path: 'src/index.ts', line: 42 });
await connector.disconnect();
```

## Connection model

1. The VS Code extension runs a local HTTP bridge on a configurable port (default `17420`).
2. `VSCodeConnector` discovers the extension via `GET /health` on that bridge.
3. On connect, it fetches workspace info and registers with the MCP orchestrator as `holoscript-vscode`.
4. A 15-second heartbeat detects disconnection and logs reconnection automatically.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VSCODE_BRIDGE_URL` | `http://localhost:17420` | Full URL of the extension HTTP bridge |

## MCP tools (8)

All tools are callable via `connector.executeTool(name, args)` or through the MCP orchestrator after registration.

| Tool | Description | Required args |
|---|---|---|
| `vscode_extension_status` | Check extension connectivity, version, features | -- |
| `vscode_file_open` | Open a file in the editor | `path`, optional `line` |
| `vscode_preview_open` | Open live preview panel for `.holo`/`.hsplus` | `path` |
| `vscode_sync_push` | Push content from Studio to workspace | `path`, `content` |
| `vscode_sync_pull` | Pull file content from workspace to Studio | `path` |
| `vscode_terminal_run` | Run a shell command in the integrated terminal | `command`, optional `cwd` |
| `vscode_mcp_status` | Check MCP server connection in the extension | -- |
| `vscode_workspace_info` | Get workspace name, root path, folders, open files | -- |

## API reference

### `VSCodeConnector` (extends `ServiceConnector`)

```ts
class VSCodeConnector {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<boolean>;
  listTools(): Promise<Tool[]>;
  executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
```

- **`connect()`** -- Reads `VSCODE_BRIDGE_URL`, pings the bridge, fetches workspace info, registers with MCP orchestrator, starts heartbeat.
- **`disconnect()`** -- Stops heartbeat, clears workspace state.
- **`health()`** -- Returns `false` if disconnected; pings the bridge if connected.
- **`listTools()`** -- Returns the 8 tool definitions from `vscodeTools`.
- **`executeTool(name, args)`** -- Dispatches to the appropriate bridge endpoint. Throws if not connected or tool is unknown.

### `vscodeTools`

```ts
const vscodeTools: Tool[];
```

Array of 8 MCP `Tool` definitions with JSON Schema input schemas. Importable separately for registration in other contexts.

## Bridge endpoints

The connector calls these HTTP endpoints on the extension bridge:

| Method | Path | Used by |
|---|---|---|
| `GET` | `/health` | `connect()`, heartbeat |
| `GET` | `/status` | `vscode_extension_status` |
| `GET` | `/api/workspace/info` | `vscode_workspace_info`, `connect()` |
| `POST` | `/api/file/open` | `vscode_file_open` |
| `POST` | `/api/preview/open` | `vscode_preview_open` |
| `POST` | `/api/sync/push` | `vscode_sync_push` |
| `POST` | `/api/sync/pull` | `vscode_sync_pull` |
| `POST` | `/api/terminal/run` | `vscode_terminal_run` |
| `POST` | `/api/mcp/status` | `vscode_mcp_status` |

## Development

```bash
pnpm build          # tsup, outputs ESM + .d.ts to dist/
pnpm test           # vitest (17 tests)
pnpm test:watch     # vitest watch mode
```

Source layout:

```
src/
  index.ts                 # re-exports VSCodeConnector + vscodeTools
  VSCodeConnector.ts       # connector implementation (241 lines)
  tools.ts                 # MCP tool definitions (89 lines)
  __tests__/
    VSCodeConnector.test.ts  # full coverage: connect, disconnect, health, tools, execution, errors
```

## License

MIT
