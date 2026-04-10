# HoloScript Knowledge Hub Integration

**Date**: 2026-02-05
**Status**: Architecture Defined
**Dependency**: AI Workspace Semantic Search Service

---

## Architecture Overview

HoloScript acts as a **client** to the centralized AI Workspace Knowledge Hub. All pattern libraries, gotcha databases, session context, and wisdom entries are stored and queried from the proprietary AI Workspace.

```
┌─────────────────────────────────────────────────────────────┐
│              AI WORKSPACE KNOWLEDGE HUB (Proprietary)        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Patterns   │  │   Gotchas    │  │   Wisdom     │       │
│  │   (P.XXX)    │  │   (G.XXX)    │  │   (W.XXX)    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │   Semantic Search     │                      │
│              │   (Qdrant + Ollama)   │                      │
│              └───────────┬───────────┘                      │
│                          │                                   │
│              ┌───────────┴───────────┐                      │
│              │      MCP Server       │                      │
│              │   (search_knowledge)  │                      │
│              └───────────┬───────────┘                      │
└──────────────────────────┼──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   HOLOSCRIPT    │ │   BRITTNEY      │ │   OTHER         │
│   CLI/MCP       │ │   AI            │ │   CLIENTS       │
│   (Public)      │ │   (Proprietary) │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## HoloScript Client Implementation

### Knowledge Client

```typescript
// packages/cli/src/knowledge-client.ts
export class KnowledgeClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.KNOWLEDGE_HUB_URL || 'http://localhost:3001';
  }

  async searchPatterns(query: string): Promise<Pattern[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        category: 'pattern',
        domain: 'holoscript',
      }),
    });
    return response.json();
  }

  async getGotchas(context: string): Promise<Gotcha[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: context,
        category: 'gotcha',
        domain: 'holoscript',
      }),
    });
    return response.json();
  }

  async reportGotcha(gotcha: NewGotcha): Promise<void> {
    await fetch(`${this.baseUrl}/gotchas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gotcha, domain: 'holoscript' }),
    });
  }

  async getWisdom(topic: string): Promise<Wisdom[]> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: topic,
        category: 'wisdom',
        domain: 'holoscript',
      }),
    });
    return response.json();
  }
}
```

---

## MCP Server Tools (Delegated)

HoloScript MCP server can delegate knowledge queries to AI Workspace:

```typescript
// packages/mcp-server/src/tools/knowledge-delegation.ts

{
  name: 'holoscript_search_patterns',
  description: 'Search HoloScript patterns from central knowledge hub',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Pattern search query' }
    },
    required: ['query']
  },
  handler: async (args) => {
    const client = new KnowledgeClient();
    const patterns = await client.searchPatterns(args.query);
    return { content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }] };
  }
},
{
  name: 'holoscript_get_gotchas',
  description: 'Get relevant gotchas for current context',
  inputSchema: {
    type: 'object',
    properties: {
      context: { type: 'string', description: 'Current coding context or error' }
    },
    required: ['context']
  },
  handler: async (args) => {
    const client = new KnowledgeClient();
    const gotchas = await client.getGotchas(args.context);
    return { content: [{ type: 'text', text: JSON.stringify(gotchas, null, 2) }] };
  }
},
{
  name: 'holoscript_report_gotcha',
  description: 'Report a new gotcha discovered during development',
  inputSchema: {
    type: 'object',
    properties: {
      mistake: { type: 'string' },
      fix: { type: 'string' },
      prevention: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } }
    },
    required: ['mistake', 'fix']
  },
  handler: async (args) => {
    const client = new KnowledgeClient();
    await client.reportGotcha(args);
    return { content: [{ type: 'text', text: 'Gotcha reported to knowledge hub' }] };
  }
}
```

---

## CLI Integration

### `.knowledge` Command

```typescript
// packages/cli/src/repl.ts

case '.knowledge':
case '.k': {
  const subcommand = parts[1];
  const query = parts.slice(2).join(' ');
  const client = new KnowledgeClient();

  switch (subcommand) {
    case 'search':
    case 's':
      const results = await client.searchPatterns(query);
      console.log(formatResults(results));
      break;

    case 'gotchas':
    case 'g':
      const gotchas = await client.getGotchas(query);
      console.log(formatGotchas(gotchas));
      break;

    case 'wisdom':
    case 'w':
      const wisdom = await client.getWisdom(query);
      console.log(formatWisdom(wisdom));
      break;

    default:
      console.log('Usage: .knowledge [search|gotchas|wisdom] <query>');
  }
  break;
}
```

---

## Environment Configuration

```bash
# .env
KNOWLEDGE_HUB_URL=http://localhost:3001  # Development
# KNOWLEDGE_HUB_URL=https://knowledge.ai-workspace.app  # Production
```

---

## Benefits of Client Architecture

1. **Separation of Concerns**: HoloScript focuses on language tooling, AI Workspace handles knowledge
2. **Data Privacy**: Proprietary knowledge stays in AI Workspace
3. **Cross-Domain Synthesis**: Brittney, HoloScript, and other tools share knowledge
4. **Scalability**: Central vector store handles millions of entries
5. **Consistency**: Single source of truth for patterns, gotchas, wisdom

---

## Implementation Status

| Component                    | Status       | Location                                                                                                                    |
| ---------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| AI Workspace Semantic Search | **Designed** | [Strategy Doc](../../../AI_Workspace/uAA2++_Protocol/4.GROW/research/2026-02-05_semantic-search-implementation-strategy.md) |
| HoloScript Knowledge Client  | **Planned**  | `packages/cli/src/knowledge-client.ts`                                                                                      |
| MCP Delegation Tools         | **Planned**  | `packages/mcp-server/src/tools/`                                                                                            |
| CLI `.knowledge` Command     | **Planned**  | `packages/cli/src/repl.ts`                                                                                                  |

---

## Related Documents

- [AI Workspace Semantic Search Strategy](../../../AI_Workspace/uAA2++_Protocol/4.GROW/research/2026-02-05_semantic-search-implementation-strategy.md)
- [MCP Server Guide](../MCP_SERVER_GUIDE.md)
- [Infinitus Terminal Enhancements](./INFINITUS_TERMINAL_ENHANCEMENTS.md)

---

_Research conducted via uAA2++ Protocol v3.3_
