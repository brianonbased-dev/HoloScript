# HoloScript Connectors

External service integrations for the HoloScript ecosystem. Each connector wraps
a third-party API as MCP tools that any AI agent can call, and can be declared in
`.holo` files via the `@connector` trait.

## Quick Start

### For agents (one command)

```bash
npx holoscript-agent --name=my-bot --ide=vscode
```

### For .holo compositions

```holo
service MyAPI {
  @connector(github)
  @connector(railway)
  @env(GITHUB_TOKEN)
  @env(RAILWAY_API_TOKEN)
  @deploy(railway, service: "my-service")

  endpoint webhooks {
    method: POST
    path: "/webhooks"
  }
}
```

Compile: `compile_to_node_service` generates `connectors/index.ts` with imports,
`initConnectors()` / `shutdownConnectors()`, and env validation.

### For TypeScript

```typescript
import { RailwayConnector } from '@holoscript/connector-railway';

const railway = new RailwayConnector();
await railway.connect();
await railway.executeTool('railway_redeploy', {
  serviceId: '098119b1-...',
  environmentId: '9cccd9a6-...',
});
await railway.disconnect();
```

## Connectors

| Package | Service | Tools | Auth Env Var |
|---------|---------|-------|-------------|
| [@holoscript/connector-railway](../connector-railway/) | Railway deployment | 16 | `RAILWAY_API_TOKEN` |
| [@holoscript/connector-upstash](../connector-upstash/) | Redis, QStash, Vector | 32 | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| [@holoscript/connector-appstore](../connector-appstore/) | Apple App Store + Google Play | 27 | (per-platform keys) |
| [@holoscript/connector-moltbook](../connector-moltbook/) | Moltbook social platform | 21 | `MOLTBOOK_API_KEY` |
| [@holoscript/connector-github](../connector-github/) | GitHub repos, PRs, issues | 20 | `GITHUB_TOKEN` |
| [@holoscript/connector-vscode](../connector-vscode/) | VS Code IDE control | 8 | (none) |

**Total: 124 tools across 6 connectors**, all registered on the [MCP orchestrator](https://mcp-orchestrator-production-45f9.up.railway.app/servers).

## Architecture

```
connector-core (this package)
├── ServiceConnector    Abstract base — connect/disconnect/health/listTools/executeTool
├── McpRegistrar        Auto-registers tools with the MCP orchestrator
├── CredentialVault     Interface for secure credential storage (store/retrieve/revoke/refresh)
└── DeploymentPipeline  Interface for compile → deploy → verify lifecycle

connector-railway     extends ServiceConnector
connector-github      extends ServiceConnector
connector-moltbook    extends ServiceConnector
connector-upstash     extends ServiceConnector
connector-appstore    extends ServiceConnector
connector-vscode      extends ServiceConnector
```

### ServiceConnector Interface

Every connector implements these 5 methods:

```typescript
abstract class ServiceConnector {
  abstract connect(): Promise<void>;           // Auth + init
  abstract disconnect(): Promise<void>;        // Cleanup
  abstract health(): Promise<boolean>;         // Is it working?
  abstract listTools(): Promise<Tool[]>;       // MCP tool definitions
  abstract executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
```

### McpRegistrar

On `connect()`, each connector auto-registers its tools with the orchestrator:

```typescript
const registrar = new McpRegistrar();
await registrar.register({
  name: 'holoscript-railway',
  url: 'local://connector-railway',
  tools: ['railway_redeploy', 'railway_service_list', ...],
});
```

The registrar uses resilient failover across multiple orchestrator URLs.

### CredentialVault (optional)

For connectors that need token refresh (OAuth):

```typescript
interface CredentialVault {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  revoke(key: string): Promise<void>;
  refresh(key: string): Promise<string | null>;
}
```

### DeploymentPipeline (optional)

For connectors that manage deployments:

```typescript
interface DeploymentPipeline {
  compile(projectPath: string): Promise<string>;                     // Build artifact
  selectTarget(tier: 'low' | 'med' | 'high' | 'ultra'): Promise<void>;  // Choose tier
  deploy(artifact: string): Promise<string>;                         // Push to target
  verify(deploymentId: string): Promise<boolean>;                    // Health check
}
```

## .holo Language Integration

Connectors are first-class in the HoloScript language via three traits:

### `@connector(name)`

Declare that a service/agent depends on a connector:

```holo
agent MyBot {
  @connector(moltbook)
  @connector(github)
}
```

The compiler:
- Validates the connector name (warns on unknown, errors on missing env)
- Generates `connectors/index.ts` with imports and lifecycle management
- Adds `@holoscript/connector-*` to `package.json` dependencies

### `@env(VAR_NAME)`

Declare required environment variables:

```holo
service API {
  @env(GITHUB_TOKEN, required: true)
  @env(PORT, default: "3000")
}
```

The compiler:
- Cross-references with `CONNECTOR_ENV_REQUIREMENTS` — if you declare `@connector(github)` without `@env(GITHUB_TOKEN)`, you get a compile error
- Generates `config/env.ts` with startup validation and typed exports

### `@deploy(platform)`

Bind to a deployment target:

```holo
service API {
  @deploy(railway, service: "mcp-server", environment: "production")
  @health("/health")
}
```

The compiler generates platform-specific config (currently Railway — `railway.json`).

## Creating a New Connector

```typescript
// packages/connector-myservice/src/MyServiceConnector.ts
import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { myServiceTools } from './tools.js';

export class MyServiceConnector extends ServiceConnector {
  private apiKey: string | null = null;
  private registrar = new McpRegistrar();

  async connect(): Promise<void> {
    this.apiKey = process.env.MY_SERVICE_API_KEY || null;
    if (!this.apiKey) throw new Error('MY_SERVICE_API_KEY required');
    this.isConnected = true;
    await this.registrar.register({
      name: 'holoscript-myservice',
      url: 'local://connector-myservice',
      tools: myServiceTools.map(t => t.name),
    });
  }

  async disconnect(): Promise<void> {
    this.apiKey = null;
    this.isConnected = false;
  }

  async health(): Promise<boolean> {
    return this.isConnected && this.apiKey !== null;
  }

  async listTools(): Promise<Tool[]> {
    return myServiceTools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) throw new Error('Not connected');
    switch (name) {
      case 'myservice_action':
        return this.callAPI('/action', args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
```

Then register in the trait constants:

```typescript
// packages/core/src/traits/constants/connector-integration.ts
export const KNOWN_CONNECTORS = [
  'railway', 'github', 'moltbook', 'upstash', 'appstore', 'vscode',
  'myservice',  // ← add here
] as const;

export const CONNECTOR_PACKAGES = {
  // ...existing...
  myservice: '@holoscript/connector-myservice',
};

export const CONNECTOR_ENV_REQUIREMENTS = {
  // ...existing...
  myservice: ['MY_SERVICE_API_KEY'],
};
```

## Environment Variables

All connectors read credentials from environment variables. Source from `.env`:

```bash
ENV_FILE="${HOME}/.ai-ecosystem/.env"; [ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a
```

| Connector | Env Var | How to get |
|-----------|---------|-----------|
| Railway | `RAILWAY_API_TOKEN` | railway.com/account/tokens → "No workspace" |
| GitHub | `GITHUB_TOKEN` | github.com/settings/tokens |
| Moltbook | `MOLTBOOK_API_KEY` | POST /api/holomesh/register |
| Upstash | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | upstash.com console |
| App Store | Apple: JWT from ASC key; Google: service account | Platform developer consoles |
| VS Code | (none) | Runs locally |

## Orchestrator Registration

All connectors are registered on the MCP orchestrator. Agents discover tools via:

```bash
curl -s -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  "https://mcp-orchestrator-production-45f9.up.railway.app/servers"
```

Or via MCP:

```json
{ "name": "suggest_tools_for_goal", "arguments": { "goal": "deploy to Railway" } }
```

## MCP Config Compiler

Write your MCP server config once in `.holo`, compile to any IDE's format:

```holo
mcp_servers {
  server holoscript {
    @connector(holoscript, transport: "http")
    url: "https://mcp.holoscript.net/mcp"
    @env(HOLOSCRIPT_API_KEY, header: "Authorization: Bearer")
  }
}
```

```bash
# Via MCP tool
compile_to_mcp_config({ code: "...", target: "claude" })      # → ${VAR} interpolation
compile_to_mcp_config({ code: "...", target: "antigravity" })  # → literal key injection
compile_to_mcp_config({ code: "...", target: "vscode" })       # → ${env:VAR} syntax
```

Solves the problem where some IDEs interpolate `${VAR}` (Claude, VS Code, Cursor) and others don't (Antigravity/Gemini). See [GOLD 041](D:/GOLD/w_gold_041.md).

## Related Docs

- [REST API Examples](../../docs/api/REST_EXAMPLES.md) — HTTP endpoints
- [MCP Tool Examples](../../docs/api/MCP_EXAMPLES.md) — MCP tool calls
- [Railway GOLD Entry](D:/GOLD/w_gold_034.md) — Project IDs and service registry
- [Absorb Service README](../absorb-service/README.md) — Graph RAG examples

## License

MIT
