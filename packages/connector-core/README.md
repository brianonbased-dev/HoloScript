# @holoscript/connector-core

> Foundational abstract interfaces and MCP Registrar for the Studio Integration Hub.

## Overview

Provides the base abstractions for all HoloScript Studio connectors (GitHub, Railway, Upstash, App Store). Each connector extends the abstract interfaces defined here and registers with the MCP Registrar.

## Key Components

| Component | Purpose |
|-----------|---------|
| `McpRegistrar` | Central MCP tool registration for all connectors |
| `ConnectorInterface` | Abstract base for all connector implementations |
| `ConnectorConfig` | Shared configuration types |

## Usage

```typescript
import { McpRegistrar, ConnectorInterface } from '@holoscript/connector-core';

// Register a connector's tools with the MCP server
const registrar = new McpRegistrar(mcpServer);
registrar.register(myConnector);
```

### Implementing a Connector

```typescript
import { ConnectorInterface } from '@holoscript/connector-core';

export class MyConnector extends ConnectorInterface {
  name = 'my-service';
  
  getTools() {
    return [
      { name: 'my_tool', description: '...', handler: this.handleTool },
    ];
  }
}
```

## Existing Connectors

| Connector | Package | Service |
|-----------|---------|---------|
| GitHub | `@holoscript/connector-github` | Repository management |
| Railway | `@holoscript/connector-railway` | Deployment |
| Upstash | `@holoscript/connector-upstash` | Redis/Kafka |
| App Store | `@holoscript/connector-appstore` | Plugin distribution |

## Related

- [MCP Server Guide](../../docs/guides/mcp-server.md)
- [Studio Integration Hub](../../docs/guides/studio-repo-management.md)

## License

MIT
