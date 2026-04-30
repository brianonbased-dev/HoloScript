/**
 * Static tool catalog exposed to the local model.
 *
 * Format mirrors Ollama's OpenAI-compatible tools array (function-style),
 * which qwen2.5-coder, llama3.1, and the other tool-capable Ollama models
 * understand natively. Each entry maps to one orchestrator-routed call.
 *
 * Why a small curated catalog instead of dumping every orchestrator tool:
 *   - 200+ tools blow the context for a 7B local model
 *   - selection encodes intent ("an agent that knows the codebase + the mesh")
 *   - the catalog is a contract; expand it deliberately, not by accident
 */

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
  /** Internal: which orchestrator server + tool to dispatch this to. */
  route: { server: string; tool: string };
}

export const TOOL_CATALOG: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'holo_query_codebase',
      description:
        'Query the absorbed HoloScript codebase graph. Use for "where is X", "what calls X", "show imports of X". Fast, structural — prefer this over reading files when you only need to locate a symbol or callers.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query kind: "find" | "callers" | "callees" | "imports" | "stats"',
            enum: ['find', 'callers', 'callees', 'imports', 'stats'],
          },
          symbol: {
            type: 'string',
            description: 'Symbol or file pattern (e.g. "useSWR", "packages/studio/src/app/create").',
          },
        },
        required: ['query', 'symbol'],
      },
    },
    route: { server: 'holoscript-tools', tool: 'holo_query_codebase' },
  },
  {
    type: 'function',
    function: {
      name: 'holo_ask_codebase',
      description:
        'Natural-language Q&A over the absorbed HoloScript graph (GraphRAG + embeddings). Use for "how does X work", "explain the flow from A to B", or any question that needs synthesis across files.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'Plain-English question about the HoloScript codebase.',
          },
        },
        required: ['question'],
      },
    },
    route: { server: 'holoscript-tools', tool: 'holo_ask_codebase' },
  },
  {
    type: 'function',
    function: {
      name: 'knowledge_query',
      description:
        'Search the HoloMesh knowledge store (W/P/G entries — wisdom, patterns, gotchas) shared across all agents on the mesh. Use to recall prior lessons, conventions, or graduated insights before asking the user.',
      parameters: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Search terms.',
          },
          type: {
            type: 'string',
            description: 'Optional entry type filter.',
            enum: ['wisdom', 'pattern', 'gotcha'],
          },
        },
        required: ['search'],
      },
    },
    route: { server: 'orchestrator', tool: 'knowledge_query' },
  },
  {
    type: 'function',
    function: {
      name: 'holo_parse_to_graph',
      description:
        'Parse a HoloScript scene (.hs / .hsplus / .holo source) and return its graph form. Use when the user pastes scene text and asks about validity, structure, or transformation.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Raw HoloScript source text.',
          },
        },
        required: ['source'],
      },
    },
    route: { server: 'holoscript-tools', tool: 'holo_parse_to_graph' },
  },
];

/**
 * Lookup a tool by the name the model will use. Returns undefined if the
 * model hallucinates a tool name we didn't expose.
 */
export function findTool(name: string): ToolDef | undefined {
  return TOOL_CATALOG.find((t) => t.function.name === name);
}

/**
 * What we ship to Ollama in the `tools` field — strip our internal `route`.
 */
export function ollamaToolsPayload(): Array<Omit<ToolDef, 'route'>> {
  return TOOL_CATALOG.map(({ type, function: fn }) => ({ type, function: fn }));
}

export const TOOL_USE_SYSTEM_GUIDANCE = `

You have tools available. Use them when they would answer the question better than your own memory:
  - holo_query_codebase / holo_ask_codebase — anything about the HoloScript repo
  - knowledge_query — prior lessons across the mesh (wisdoms, patterns, gotchas)
  - holo_parse_to_graph — validate or analyze pasted scene source

Rules:
  - Don't invent tool names. Only call tools listed above.
  - Don't narrate "I will call the tool". Just call it.
  - After a tool returns, integrate the result into a direct answer. Don't restate the raw JSON.
  - If a tool fails, say so plainly and answer from what you know.`;
