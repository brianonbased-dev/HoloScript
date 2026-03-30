# Connector Architecture (Studio Integration Hub)

> The service connector pattern: `McpRegistrar`, `CredentialVault`, `DeploymentPipeline`, and the abstract `ConnectorInterface`.

## Overview

The Studio Integration Hub provides a unified pattern for connecting HoloScript Studio to external services (GitHub, Railway, Upstash, App Store). Each connector extends a common abstract interface and registers MCP tools via the `McpRegistrar`.

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│  HoloScript Studio                                  │
│  ├── Service Connector Hub (UI panel)               │
│  └── First Run Wizard (onboarding)                  │
└───────────────┬─────────────────────────────────────┘
                │ uses
                ▼
┌─────────────────────────────────────────────────────┐
│  @holoscript/connector-core                         │
│                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ McpRegistrar │  │ Credential   │  │ Deployment │ │
│  │              │  │ Vault        │  │ Pipeline   │ │
│  │ Registers    │  │              │  │            │ │
│  │ tools on MCP │  │ Secure token │  │ Multi-stage│ │
│  │ server       │  │ storage      │  │ deploy     │ │
│  └──────┬───────┘  └──────────────┘  └────────────┘ │
│         │                                           │
│  ┌──────┴───────────────────────────────────────┐   │
│  │  ConnectorInterface (abstract)                │   │
│  │  ├── name: string                             │   │
│  │  ├── getTools(): MCPToolDefinition[]           │   │
│  │  ├── connect(credentials): Promise<void>      │   │
│  │  └── disconnect(): Promise<void>              │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                │ extends
    ┌───────────┼───────────┬───────────┐
    ▼           ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ GitHub  │ │ Railway │ │ Upstash │ │ App     │
│Connector│ │Connector│ │Connector│ │ Store   │
│         │ │         │ │         │ │Connector│
│ repos,  │ │ deploy, │ │ redis,  │ │ publish,│
│ PRs,    │ │ logs,   │ │ kafka,  │ │ review, │
│ actions │ │ env vars│ │ vector  │ │ install │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## Key Components

### McpRegistrar

Central tool registration for all connectors. Each connector declares its MCP tools and the registrar wires them to the server.

```typescript
import { McpRegistrar } from '@holoscript/connector-core';

const registrar = new McpRegistrar(mcpServer);

// Register connector tools on the MCP server
registrar.register(githubConnector);
registrar.register(railwayConnector);

// Tools become available as MCP tools:
// github_list_repos, github_create_pr, railway_deploy, etc.
```

### CredentialVault

Secure credential storage using OS-native keychain integration:

```typescript
import { CredentialVault } from '@holoscript/connector-core';

const vault = new CredentialVault();

// Store credentials securely
await vault.store('github', { token: 'ghp_...' });

// Retrieve for connector use
const creds = await vault.get('github');
```

### DeploymentPipeline

Multi-stage deployment orchestration:

```typescript
import { DeploymentPipeline } from '@holoscript/connector-core';

const pipeline = new DeploymentPipeline({
  stages: ['build', 'test', 'deploy'],
  connector: railwayConnector,
});

await pipeline.execute({
  service: 'holoscript-api',
  environment: 'production',
});
```

## Connector MCP Tools

| Connector     | Tools                                                                           |
| ------------- | ------------------------------------------------------------------------------- |
| **GitHub**    | `github_list_repos`, `github_create_pr`, `github_get_file`, `github_run_action` |
| **Railway**   | `railway_deploy`, `railway_logs`, `railway_env_vars`, `railway_services`        |
| **Upstash**   | `upstash_redis_get`, `upstash_redis_set`, `upstash_kafka_publish`               |
| **App Store** | `appstore_publish`, `appstore_review`, `appstore_install`                       |

## Adding a New Connector

See the [Contributing Guide](../guides/contributing-new-compiler.md) pattern. Connector creation follows a similar approach:

1. Create `packages/connector-<name>/`
2. Add `package.json` with `@holoscript/connector-core` dependency
3. Implement `ConnectorInterface`
4. Register tools via `McpRegistrar`
5. Add credential schema to `CredentialVault`

## Related

- [connector-core README](../../packages/connector-core/README.md) — Package docs
- [Internal MCP](./INTERNAL_MCP.md) — MCP architecture overview
- [Extension System](./EXTENSION_SYSTEM.md) — Plugin architecture
