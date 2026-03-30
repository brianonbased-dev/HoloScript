# @holoscript/connector-railway

Railway GraphQL API connector for the HoloScript Studio Integration Hub.

## Overview

Wraps the Railway GraphQL API at `https://backboard.railway.com/graphql/v2` as MCP tools with rate limit handling and exponential backoff. Auto-registers with the MCP orchestrator as the `holoscript-railway` server.

## Installation

```bash
pnpm add @holoscript/connector-railway
```

## Environment Variables

```bash
RAILWAY_API_TOKEN=your-railway-token-here
```

Get your token from: https://railway.com/account/tokens

## Usage

```typescript
import { RailwayConnector } from '@holoscript/connector-railway';

// Initialize and connect
const railway = new RailwayConnector();
await railway.connect();

// Check health
const healthy = await railway.health();

// List available tools
const tools = await railway.listTools();

// Execute a tool
const result = await railway.executeTool('railway_project_create', {
  name: 'my-holoscript-project',
});

// Clean up
await railway.disconnect();
```

## Available Tools

### railway_project_create

Create a new Railway project.

**Parameters:**

- `name` (string, required): Project name
- `description` (string, optional): Project description

**Returns:** Project object with `id` and `name`

### railway_service_create

Create a service inside a Railway project.

**Parameters:**

- `projectId` (string, required): Parent project ID
- `name` (string, required): Service name

**Returns:** Service object with `id` and `name`

### railway_deploy

Trigger a deployment for a service.

**Parameters:**

- `serviceId` (string, required): Service ID to deploy
- `environmentId` (string, required): Target environment ID

**Returns:** Deployment object with `id`

### railway_variable_set

Set an environment variable for a service.

**Parameters:**

- `projectId` (string, required): Project ID
- `environmentId` (string, required): Environment ID
- `serviceId` (string, required): Service ID
- `name` (string, required): Variable name
- `value` (string, required): Variable value

**Returns:** Success confirmation

### railway_domain_add

Attach a custom domain to a service deployment.

**Parameters:**

- `serviceId` (string, required): Service ID
- `environmentId` (string, required): Environment ID
- `domain` (string, required): Domain name (e.g., `api.example.com`)

**Returns:** Domain object with `id`

### railway_deployment_status

Check the status of a specific deployment.

**Parameters:**

- `deploymentId` (string, required): Deployment ID to check

**Returns:** Deployment object with `id` and `status`

## Rate Limiting

The connector automatically handles Railway's rate limits:

- Monitors `X-RateLimit-Remaining` header
- Implements exponential backoff (1s, 2s, 4s)
- Retries up to 3 times on rate limit errors
- Throws error if all retries exhausted

## MCP Orchestrator Registration

On `connect()`, the connector auto-registers with the MCP orchestrator at:

```
https://mcp-orchestrator-production-45f9.up.railway.app/register
```

**Registration payload:**

```json
{
  "name": "holoscript-railway",
  "url": "http://localhost:0",
  "tools": [
    "railway_project_create",
    "railway_service_create",
    "railway_deploy",
    "railway_variable_set",
    "railway_domain_add",
    "railway_deployment_status"
  ]
}
```

## Example: Deploy HoloScript MCP Server

```typescript
import { RailwayConnector } from '@holoscript/connector-railway';

const railway = new RailwayConnector();
await railway.connect();

// 1. Create project
const project = (await railway.executeTool('railway_project_create', {
  name: 'holoscript-mcp-production',
})) as any;

// 2. Create service
const service = (await railway.executeTool('railway_service_create', {
  projectId: project.data.projectCreate.id,
  name: 'mcp-server',
})) as any;

// 3. Set environment variables
await railway.executeTool('railway_variable_set', {
  projectId: project.data.projectCreate.id,
  environmentId: 'production-env-id',
  serviceId: service.data.serviceCreate.id,
  name: 'MCP_API_KEY',
  value: 'dev-key-12345',
});

// 4. Trigger deployment
const deployment = (await railway.executeTool('railway_deploy', {
  serviceId: service.data.serviceCreate.id,
  environmentId: 'production-env-id',
})) as any;

// 5. Poll deployment status
const status = (await railway.executeTool('railway_deployment_status', {
  deploymentId: deployment.data.deploymentCreate.id,
})) as any;

console.log('Deployment status:', status.data.deployment.status);

// 6. Add custom domain
await railway.executeTool('railway_domain_add', {
  serviceId: service.data.serviceCreate.id,
  environmentId: 'production-env-id',
  domain: 'mcp.holoscript.net',
});

await railway.disconnect();
```

## Architecture

```
RailwayConnector extends ServiceConnector
├── connect()               Auto-auth + orchestrator registration
├── disconnect()            Cleanup
├── health()                Connection status check
├── listTools()             Enumerate 6 MCP tools
├── executeTool()           Route tool calls to GraphQL mutations/queries
└── executeGraphQLWithBackoff()  HTTP client with rate limit handling
```

## Error Handling

```typescript
try {
  await railway.executeTool('railway_project_create', { name: 'test' });
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Rate limit exceeded after retries
  } else if (error.message.includes('not connected')) {
    // Must call connect() first
  } else {
    // Railway API error
  }
}
```

## Testing

```bash
# Set test credentials
export RAILWAY_API_TOKEN=test-token

# Run tests
pnpm test
```

## Links

- Railway API: https://docs.railway.com/reference/public-api
- Railway Dashboard: https://railway.com/dashboard
- MCP Orchestrator: https://mcp-orchestrator-production-45f9.up.railway.app

## License

MIT
