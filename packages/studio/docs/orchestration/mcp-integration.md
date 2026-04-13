# MCP Integration Guide

**Connect HoloScript Studio to external tools via Model Context Protocol**

The MCP Server Config Panel enables HoloScript Studio to discover, test, and execute tools from external MCP servers. Integrate with file systems, APIs, databases, and custom services through a unified protocol.

---

## Table of Contents

- [What is MCP?](#what-is-mcp)
- [MCP Server Configuration](#mcp-server-configuration)
- [Discovering and Connecting to Servers](#discovering-and-connecting-to-servers)
- [Testing MCP Tools](#testing-mcp-tools)
- [Creating Custom MCP Servers](#creating-custom-mcp-servers)
- [Authentication and Security](#authentication-and-security)
- [Rate Limiting and Health Checks](#rate-limiting-and-health-checks)
- [Monitoring Tool Calls](#monitoring-tool-calls)
- [Troubleshooting MCP Connections](#troubleshooting-mcp-connections)

---

## What is MCP?

**Model Context Protocol (MCP)** is a standardized protocol for AI systems to interact with external tools and services. MCP enables:

- **Tool Discovery** - Dynamically find available tools from servers
- **Unified Interface** - Consistent API across different tool providers
- **Type Safety** - Strongly-typed tool parameters and results
- **Resource Management** - Access files, databases, and APIs
- **Server Federation** - Multiple servers in a mesh architecture

### MCP Architecture

```
┌──────────────────────────────────────────────────────┐
│           HoloScript Studio (Client)                 │
│  ┌────────────────┐         ┌──────────────────┐    │
│  │ MCP Server     │         │  Orchestration   │    │
│  │ Config Panel   │◀───────▶│  Store           │    │
│  └────────┬───────┘         └──────────────────┘    │
│           │                                          │
└───────────┼──────────────────────────────────────────┘
            │
            │ HTTP/WebSocket
            │
┌───────────▼──────────────────────────────────────────┐
│         MCP Mesh Orchestrator                        │
│         http://localhost:5567                        │
│  ┌──────────────────────────────────────────────┐   │
│  │  Tool Discovery  │  Health Checks  │  Router │   │
│  └──────────────────────────────────────────────┘   │
└───────────┬──────────────────────────────────────────┘
            │
    ┌───────┼───────┬─────────────┬────────────┐
    │       │       │             │            │
┌───▼───┐ ┌▼────┐ ┌▼──────┐  ┌───▼────┐  ┌───▼────┐
│File   │ │Git  │ │Semantic│ │HoloScript│ │Custom  │
│System │ │     │ │Search  │ │Language  │ │Server  │
│Server │ │     │ │Hub     │ │          │ │        │
└───────┘ └─────┘ └────────┘ └──────────┘ └────────┘
```

### Key Concepts

- **Server** - Hosts tools (e.g., filesystem, git, database)
- **Tool** - Individual function exposed by server (e.g., read_file, git_commit)
- **Resource** - Data accessible through MCP (files, database records, API responses)
- **Client** - Application using MCP tools (HoloScript Studio)
- **Orchestrator** - Central hub coordinating multiple servers

---

## MCP Server Configuration

### Opening the MCP Panel

**Keyboard Shortcut:** `Ctrl+M`

**Or via UI:**

1. Click the "MCP" icon in the toolbar
2. Panel opens showing server list

### Default Server Configuration

HoloScript Studio auto-configures the MCP Mesh Orchestrator:

```typescript
{
  name: 'mcp-orchestrator',
  url: 'http://localhost:5567',
  apiKey: 'YOUR_HOLOSCRIPT_API_KEY',
  enabled: true,
  healthCheckInterval: 30000,  // 30 seconds
  timeout: 10000,              // 10 seconds
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2
  },
  features: {
    semanticSearch: true,
    toolDiscovery: true,
    resourceManagement: true
  }
}
```

### Server List Interface

```
┌────────────────────────────────────────────────────┐
│ [MCP Servers]                      [Config] [×]    │
├────────────────────────────────────────────────────┤
│                                                    │
│  ● mcp-orchestrator                        [✓]    │
│    http://localhost:5567                          │
│    8 tools • 245ms                                │
│                                                    │
│  ● semantic-search-hub                     [✓]    │
│    via orchestrator                               │
│    5 tools • 156ms                                │
│                                                    │
│  ○ holoscript-language                     [ ]    │
│    via orchestrator                               │
│    Connection failed: ECONNREFUSED                │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Server Card Components:**

- **Status Indicator** - Green (online), Red (offline), Gray (disabled)
- **Server Name** - Unique identifier
- **URL** - Server endpoint
- **Tool Count** - Number of available tools
- **Response Time** - Health check latency
- **Enabled Toggle** - Enable/disable server
- **Error Message** - Connection failure details

---

## Discovering and Connecting to Servers

### Automatic Discovery

The MCP Orchestrator automatically discovers registered servers:

1. Client connects to orchestrator
2. Orchestrator returns list of available servers
3. Client fetches tools from each server
4. Tools become available in workflow/behavior tree editors

### Manual Server Addition

To add a custom server:

1. Click **"Config"** button in MCP panel header
2. Enter server details:
   - Name: `my-custom-server`
   - URL: `http://localhost:8080`
   - API Key: (if required)
3. Click **"Add Server"**
4. Server appears in list with health check

### Registered Servers

Default servers in MCP Mesh Orchestrator:

| Server                   | Purpose             | Tools                                    |
| ------------------------ | ------------------- | ---------------------------------------- |
| `mcp-filesystem`         | File operations     | read_file, write_file, list_directory    |
| `mcp-git`                | Git version control | git_status, git_commit, git_push         |
| `mcp-github`             | GitHub integration  | create_pr, list_issues, get_repo         |
| `semantic-search-hub`    | Vector search       | search_knowledge, add_pattern, reindex   |
| `holoscript-language`    | Language services   | parse_code, validate_syntax, generate    |
| `brittney-hololand`      | AI agent            | chat, generate_scene, optimize           |
| `ai-workspace-knowledge` | Knowledge base      | query_docs, add_insight, get_context     |
| `uaa2-service`           | Authentication      | verify_token, get_user, check_permission |

---

## Testing MCP Tools

### Tool Browser

When you select a server, the Tool Browser displays available tools:

```
┌────────────────────────────────────────────────────┐
│  [🔍 Search tools...]                              │
├────────────────────────────────────────────────────┤
│                                                    │
│  search_knowledge                          [▶]    │
│  Semantic search across patterns, gotchas, wisdom │
│  query, limit, threshold                          │
│                                                    │
│  add_pattern                               [▶]    │
│  Add a new pattern to the knowledge base          │
│  title, description, category                     │
│                                                    │
│  reindex_knowledge                         [▶]    │
│  Rebuild the vector search index                  │
│  (no parameters)                                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Tool Card Components:**

- **Tool Name** - Function identifier (mono font)
- **Description** - What the tool does
- **Parameters** - Required and optional arguments
- **Play Button** - Opens tool tester

### Tool Tester Interface

Click the **[▶]** button to test a tool:

```
┌────────────────────────────────────────────────────┐
│  [▶] Test Tool: search_knowledge              [×]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  query *                                           │
│  ┌──────────────────────────────────────────────┐ │
│  │ parser error handling                        │ │
│  └──────────────────────────────────────────────┘ │
│  Search query for knowledge base                  │
│                                                    │
│  limit                                             │
│  ┌──────────────────────────────────────────────┐ │
│  │ 5                                            │ │
│  └──────────────────────────────────────────────┘ │
│  Maximum number of results (default: 10)          │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ ✓ Success                                    │ │
│  │ {                                            │ │
│  │   "results": [                               │ │
│  │     {                                        │ │
│  │       "title": "Error Handling Pattern",    │ │
│  │       "score": 0.92,                        │ │
│  │       "content": "..."                      │ │
│  │     }                                        │ │
│  │   ]                                          │ │
│  │ }                                            │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
├────────────────────────────────────────────────────┤
│  [▶ Test Tool]                                     │
└────────────────────────────────────────────────────┘
```

**Testing Workflow:**

1. **Fill Parameters** - Enter values for required (\*) and optional fields
2. **Click "Test Tool"** - Executes tool call
3. **View Result** - Success (green ✓) or Error (red ✗)
4. **Inspect Output** - JSON-formatted result or error message

### Example: Testing search_knowledge

**Input:**

```
query: "parser error handling"
limit: 5
threshold: 0.7
```

**Output (Success):**

```json
{
  "results": [
    {
      "id": "pattern_123",
      "title": "Error Handling in Parsers",
      "category": "patterns",
      "score": 0.92,
      "content": "Always use try-catch blocks around parser calls..."
    },
    {
      "id": "gotcha_045",
      "title": "Parser EOF Edge Case",
      "category": "gotchas",
      "score": 0.84,
      "content": "Check for EOF before consuming next token..."
    }
  ],
  "total": 2
}
```

**Output (Error):**

```json
{
  "error": "Connection refused: ECONNREFUSED",
  "code": "CONNECTION_ERROR"
}
```

---

## Creating Custom MCP Servers

### Server Implementation

Create a simple MCP server in TypeScript:

```typescript
import express from 'express';
import { MCPServer, MCPTool } from '@modelcontextprotocol/sdk';

const app = express();
const server = new MCPServer({
  name: 'my-custom-server',
  version: '1.0.0',
});

// Define a tool
const greetTool: MCPTool = {
  name: 'greet',
  description: 'Generate a personalized greeting',
  parameters: {
    name: {
      type: 'string',
      description: 'Name of the person to greet',
      required: true,
    },
    formal: {
      type: 'boolean',
      description: 'Use formal greeting',
      required: false,
      default: false,
    },
  },
  handler: async (args) => {
    const { name, formal } = args;
    const greeting = formal ? `Good day, ${name}.` : `Hey ${name}! How's it going?`;

    return { success: true, result: { greeting } };
  },
};

server.registerTool(greetTool);

app.use(express.json());

// Tool discovery endpoint
app.get('/tools', (req, res) => {
  res.json(server.getTools());
});

// Tool execution endpoint
app.post('/tools/call', async (req, res) => {
  const { tool, args } = req.body;
  const result = await server.executeTool(tool, args);
  res.json(result);
});

app.listen(8080, () => {
  console.log('MCP server running on http://localhost:8080');
});
```

### Registering with Orchestrator

Add your server to the orchestrator config:

```bash
curl -X POST http://localhost:5567/servers \
  -H "x-mcp-api-key: YOUR_HOLOSCRIPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-custom-server",
    "url": "http://localhost:8080",
    "enabled": true
  }'
```

### Tool Schema Best Practices

**1. Clear Descriptions**

```typescript
{
  description: 'Search files by content using regex patterns';
  // ✓ Specific and actionable
}
```

**2. Parameter Validation**

```typescript
{
  name: 'query',
  type: 'string',
  required: true,
  minLength: 3,
  maxLength: 200,
  pattern: '^[a-zA-Z0-9 ]+$'
}
```

**3. Default Values**

```typescript
{
  name: 'limit',
  type: 'number',
  default: 10,
  minimum: 1,
  maximum: 100
}
```

---

## Authentication and Security

### API Key Authentication

Configure API keys for secure server access:

```typescript
const server: MCPServerConfig = {
  name: 'secure-server',
  url: 'https://api.example.com',
  apiKey: process.env.HOLOSCRIPT_API_KEY, // ← From environment
  enabled: true,
};
```

### Request Headers

API keys are sent in request headers:

```http
POST /tools/call HTTP/1.1
Host: localhost:5567
Content-Type: application/json
x-mcp-api-key: YOUR_HOLOSCRIPT_API_KEY

{
  "server": "semantic-search-hub",
  "tool": "search_knowledge",
  "args": { "query": "..." }
}
```

### Storing API Keys

**Best Practices:**

1. **Environment Variables** - Never commit keys to Git
2. **localStorage (Development)** - Auto-filled in dev mode
3. **Encrypted Storage (Production)** - Use secure credential storage

**Implementation:**

```typescript
// Load from localStorage (dev mode)
const [apiKey, setApiKey] = useLocalStorage('mcp-api-key', 'YOUR_HOLOSCRIPT_API_KEY');

// Update server config
updateMCPServer('mcp-orchestrator', { apiKey });
```

---

## Rate Limiting and Health Checks

### Health Check Configuration

Each server is monitored with periodic health checks:

```typescript
{
  healthCheckInterval: 30000,  // Check every 30 seconds
  timeout: 10000,              // 10 second timeout
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2       // 1s, 2s, 4s backoff
  }
}
```

### Health Check Flow

```
1. Client → GET /health (orchestrator)
   ← Status: { healthy: true, responseTime: 45ms }

2. Client → GET /servers (orchestrator)
   ← Server list with health status

3. For each server:
   Client → GET /tools (server)
   ← Tool list + metadata

4. Update UI with health indicators:
   ● Green - Healthy (< 500ms)
   ● Yellow - Degraded (500-2000ms)
   ● Red - Offline (> 2000ms or error)
```

### Rate Limiting

Implement rate limiting in custom servers:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
});

app.use('/tools/call', limiter);
```

### Circuit Breaker Pattern

Automatically disable failing servers:

```typescript
const checkHealth = async (server: MCPServerConfig) => {
  try {
    const response = await fetch(`${server.url}/health`, {
      timeout: server.timeout,
    });

    if (!response.ok) {
      server.failureCount++;
    } else {
      server.failureCount = 0;
    }

    // Circuit breaker: disable after 5 failures
    if (server.failureCount >= 5) {
      updateMCPServer(server.name, { enabled: false });
      console.warn(`Server ${server.name} disabled due to repeated failures`);
    }
  } catch (error) {
    server.failureCount++;
  }
};
```

---

## Monitoring Tool Calls

### Tool Call Graph Visualizer

Press `Ctrl+Shift+T` to open the Tool Call Graph:

```
┌────────────────────────────────────────────────────┐
│  [⚡] Tool Call Graph                          [×] │
├────────────────────────────────────────────────────┤
│  Total: 42    Success: 38    Error: 4    Avg: 234ms│
├────────────────────────────────────────────────────┤
│                                                    │
│  ✓ search_knowledge                                │
│    semantic-search • 234ms • by brittney           │
│    [View args & result ▼]                          │
│                                                    │
│  ✓ read_file                                       │
│    mcp-filesystem • 12ms • by workflow_123         │
│    [View args & result ▼]                          │
│                                                    │
│  ✗ git_commit                                      │
│    mcp-git • 1456ms • by workflow_123              │
│    Error: No changes to commit                     │
│    [View args & result ▼]                          │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Statistics Dashboard

**Metrics Tracked:**

- Total tool calls
- Success/error counts
- Average response time
- Slowest tool calls
- Most frequently used tools
- Error rate by server

### Example Call Details

Expand a tool call to see full details:

```json
{
  "id": "call_1234567890",
  "toolName": "search_knowledge",
  "server": "semantic-search-hub",
  "status": "success",
  "duration": 234,
  "triggeredBy": "brittney",
  "timestamp": 1772271967567,
  "args": {
    "query": "parser error handling",
    "limit": 5
  },
  "result": {
    "results": [{ "title": "Error Handling Pattern", "score": 0.92 }]
  }
}
```

---

## Troubleshooting MCP Connections

### Common Issues

#### 1. Server Connection Failed

**Symptom:** Red indicator, "Connection refused: ECONNREFUSED"

**Solutions:**

1. Verify orchestrator is running: `curl http://localhost:5567/health`
2. Check server URL is correct
3. Ensure no firewall blocking port 5567
4. Check orchestrator logs for errors

---

#### 2. Tool Call Timeout

**Symptom:** Tool call hangs, then fails with timeout error

**Solutions:**

1. Increase timeout: `{ timeout: 30000 }` (30 seconds)
2. Check server performance (slow database queries?)
3. Implement retry logic with exponential backoff
4. Use async tools for long-running operations

---

#### 3. Authentication Failed

**Symptom:** "401 Unauthorized" or "Invalid API key"

**Solutions:**

1. Verify API key is correct: Check localStorage or environment variable
2. Ensure header format: `x-mcp-api-key: your-key-here`
3. Check orchestrator API key matches client key
4. Regenerate API key if compromised

---

#### 4. Tool Not Found

**Symptom:** "Tool 'xyz' not found on server"

**Solutions:**

1. Refresh server tool list: Click server in MCP panel
2. Verify tool is registered: Check server `/tools` endpoint
3. Check server version (tool might be in newer version)
4. Ensure server is enabled and healthy

---

#### 5. Invalid Parameters

**Symptom:** "Parameter 'query' is required" or type mismatch errors

**Solutions:**

1. Check tool parameter schema in Tool Browser
2. Verify required (\*) parameters are provided
3. Match parameter types (string, number, boolean)
4. Use Tool Tester to validate parameters before workflow use

---

### Debugging Workflow

**Step 1:** Check Orchestrator Health

```bash
curl http://localhost:5567/health
# Expected: { "status": "healthy", "uptime": 12345 }
```

**Step 2:** List Available Servers

```bash
curl -H "x-mcp-api-key: YOUR_HOLOSCRIPT_API_KEY" \
  http://localhost:5567/servers
# Expected: [{ "name": "semantic-search-hub", ... }]
```

**Step 3:** Test Tool Directly

```bash
curl -X POST http://localhost:5567/tools/call \
  -H "x-mcp-api-key: YOUR_HOLOSCRIPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "server": "semantic-search-hub",
    "tool": "search_knowledge",
    "args": { "query": "test", "limit": 1 }
  }'
```

**Step 4:** Check Client-Side Logs

```javascript
// In browser console
localStorage.getItem('mcp-api-key');
// Should return your API key

// Check orchestration store state
window.__ORCHESTRATION_STORE__.getState();
```

---

## Advanced Topics

### Server Mesh Architecture

Multiple orchestrators can federate:

```
Client
  ├─ Primary Orchestrator (localhost:5567)
  │   ├─ Local Servers (filesystem, git)
  │   └─ Federated Servers (via secondary orchestrator)
  │
  └─ Secondary Orchestrator (remote:5567)
      └─ Remote Servers (cloud APIs, databases)
```

### Custom Tool Categories

Organize tools by category:

```typescript
const tool: MCPTool = {
  name: 'optimize_scene',
  description: 'Optimize 3D scene for performance',
  category: 'graphics', // Custom category
  tags: ['3d', 'performance', 'optimization'],
  // ...
};
```

Filter by category in Tool Browser:

```
[Graphics] [AI] [Database] [File System]
```

---

## Next Steps

- [Create Workflows](./workflows.md) using MCP tools
- [Build Behavior Trees](./behavior-trees.md) with tool actions
- [Monitor Execution](./troubleshooting.md) in real-time

---

**Happy Integrating!**
