/**
 * MCP Developer Tools — v5.9 "Developer Portal"
 *
 * 5 tools: get_api_reference, serve_preview, get_workspace_info,
 * inspect_trace_waterfall, get_dev_dashboard_state
 *
 * @version 1.0.0
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { APIDocsGenerator } from './api-docs-generator';
import { TraceWaterfallRenderer } from '@holoscript/core';
import type { TraceSpan } from '@holoscript/core';

// =============================================================================
// SINGLETONS
// =============================================================================

let docsGenerator: APIDocsGenerator | null = null;
let waterfallRenderer: TraceWaterfallRenderer | null = null;

function getDocsGenerator(): APIDocsGenerator {
  if (!docsGenerator) docsGenerator = new APIDocsGenerator({ version: '6.0.0' });
  return docsGenerator;
}

function getWaterfallRenderer(): TraceWaterfallRenderer {
  if (!waterfallRenderer) waterfallRenderer = new TraceWaterfallRenderer();
  return waterfallRenderer;
}

export function resetDeveloperSingletons(): void {
  docsGenerator = null;
  waterfallRenderer = null;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const developerTools: Tool[] = [
  {
    name: 'get_api_reference',
    description:
      'Generate API reference documentation for all MCP tools. Returns markdown or JSON format with categories, parameters, and examples.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: {
          type: 'string',
          description: 'Output format: "markdown" or "json"',
          enum: ['markdown', 'json'],
        },
        category: {
          type: 'string',
          description: 'Filter by category name (optional)',
        },
      },
      required: [],
    },
  },
  {
    name: 'serve_preview',
    description:
      'Get dev server state and composition preview data. Returns current files, parse status, and connected client info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        root: {
          type: 'string',
          description: 'Root directory to scan for compositions (defaults to working directory)',
        },
        extensions: {
          type: 'array',
          description: 'File extensions to include',
          items: { type: 'string' },
        },
      },
      required: [],
    },
  },
  {
    name: 'get_workspace_info',
    description:
      'Get workspace configuration, members, composition counts, and build order from holoscript.workspace.json.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        root: {
          type: 'string',
          description: 'Workspace root directory (defaults to working directory)',
        },
        includeBuildOrder: {
          type: 'boolean',
          description: 'Whether to include build order analysis (default: true)',
        },
      },
      required: [],
    },
  },
  {
    name: 'inspect_trace_waterfall',
    description:
      'Convert trace spans into a waterfall visualization with timing, nesting, agent colors, and critical path analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spans: {
          type: 'array',
          description: 'Array of TraceSpan objects to visualize',
          items: {
            type: 'object',
            properties: {
              traceId: { type: 'string' },
              spanId: { type: 'string' },
              parentSpanId: { type: 'string' },
              name: { type: 'string' },
              kind: { type: 'string' },
              startTime: { type: 'number' },
              endTime: { type: 'number' },
              status: { type: 'string' },
              attributes: { type: 'object' },
            },
          },
        },
        minDuration: {
          type: 'number',
          description: 'Minimum span duration to display (ms)',
        },
      },
      required: ['spans'],
    },
  },
  {
    name: 'get_dev_dashboard_state',
    description:
      'Get comprehensive developer dashboard state including composition status, trace summaries, agent registry, plugin status, and budget/usage info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sections: {
          type: 'array',
          description:
            'Which dashboard sections to include (default: all). Options: compositions, traces, agents, plugins, economy, api',
          items: {
            type: 'string',
            enum: ['compositions', 'traces', 'agents', 'plugins', 'economy', 'api'],
          },
        },
      },
      required: [],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleDeveloperTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_api_reference':
      return handleGetApiReference(args);
    case 'serve_preview':
      return handleServePreview(args);
    case 'get_workspace_info':
      return handleGetWorkspaceInfo(args);
    case 'inspect_trace_waterfall':
      return handleInspectTraceWaterfall(args);
    case 'get_dev_dashboard_state':
      return handleGetDevDashboardState(args);
    default:
      throw new Error(`Unknown developer tool: ${name}`);
  }
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleGetApiReference(args: Record<string, unknown>): Promise<unknown> {
  const { tools } = await import('./tools');
  const generator = getDocsGenerator();
  const ref = generator.generate(tools);

  // Filter by category if specified
  if (args.category) {
    ref.categories = ref.categories.filter(
      (c) => c.name.toLowerCase() === (args.category as string).toLowerCase()
    );
    ref.totalTools = ref.categories.reduce((sum, c) => sum + c.tools.length, 0);
  }

  const format = (args.format as string) || 'json';
  if (format === 'markdown') {
    return { format: 'markdown', content: generator.toMarkdown(ref) };
  }

  return { format: 'json', reference: ref };
}

async function handleServePreview(args: Record<string, unknown>): Promise<unknown> {
  const { existsSync, readdirSync, readFileSync, statSync } = await import('fs');
  const { join, extname } = await import('path');

  const root = (args.root as string) || process.cwd();
  const extensions = (args.extensions as string[]) || ['.holo', '.hs', '.hsplus'];

  // Scan for compositions
  const compositions: Array<{
    path: string;
    size: number;
    lines: number;
  }> = [];

  const scan = (dir: string, depth: number): void => {
    if (depth <= 0) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scan(fullPath, depth - 1);
        } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
          const stat = statSync(fullPath);
          const content = readFileSync(fullPath, 'utf-8');
          compositions.push({
            path: fullPath.replace(root, '').replace(/\\/g, '/'),
            size: stat.size,
            lines: content.split('\n').length,
          });
        }
      }
    } catch {
      // Skip unreadable
    }
  };

  if (existsSync(root)) {
    scan(root, 5);
  }

  return {
    root,
    compositionCount: compositions.length,
    compositions,
    extensions,
    serverRunning: false, // No live server in MCP context
  };
}

async function handleGetWorkspaceInfo(args: Record<string, unknown>): Promise<unknown> {
  const root = (args.root as string) || process.cwd();
  const includeBuildOrder = args.includeBuildOrder !== false;

  const { WorkspaceManager } = await import('./workspace-manager-bridge');

  const manager = new WorkspaceManager(root);
  const config = manager.load();

  if (!config) {
    return {
      found: false,
      root,
      message: 'No holoscript.workspace.json found. Use `holoscript workspace init` to create one.',
    };
  }

  const info = manager.getInfo();
  const result: Record<string, unknown> = {
    found: true,
    ...info,
  };

  if (includeBuildOrder) {
    result.buildOrder = manager.getBuildOrder();
  }

  return result;
}

async function handleInspectTraceWaterfall(args: Record<string, unknown>): Promise<unknown> {
  const spans = args.spans as TraceSpan[];
  if (!spans || !Array.isArray(spans)) {
    throw new Error('spans parameter is required and must be an array');
  }

  // Normalize span data
  const normalized: TraceSpan[] = spans.map((s) => ({
    traceId: s.traceId || '',
    spanId: s.spanId || '',
    parentSpanId: s.parentSpanId,
    name: s.name || 'unnamed',
    kind: s.kind || 'internal',
    startTime: s.startTime || 0,
    endTime: s.endTime,
    status: s.status || 'unset',
    attributes: s.attributes,
    events: s.events,
  }));

  const renderer = getWaterfallRenderer();
  if (args.minDuration) {
    const customRenderer = new TraceWaterfallRenderer({
      minDuration: args.minDuration as number,
    });
    return { waterfall: customRenderer.render(normalized) };
  }

  return { waterfall: renderer.render(normalized) };
}

async function handleGetDevDashboardState(args: Record<string, unknown>): Promise<unknown> {
  const sections = (args.sections as string[]) || [
    'compositions',
    'traces',
    'agents',
    'plugins',
    'economy',
    'api',
  ];

  const state: Record<string, unknown> = {};

  if (sections.includes('traces')) {
    try {
      const { getTelemetryCollector } = await import('@holoscript/core');
      const collector = getTelemetryCollector();
      const stats = collector.getStats();
      state.traces = {
        totalSpans: stats.totalSpans,
        activeSpans: stats.activeSpans,
        totalEvents: stats.totalEvents,
      };
    } catch {
      state.traces = { totalSpans: 0, activeSpans: 0, totalEvents: 0 };
    }
  }

  if (sections.includes('api')) {
    try {
      const { tools } = await import('./tools');
      state.api = {
        totalTools: tools.length,
        categories: new Set(
          tools.map((t) => getDocsGenerator().generate([t]).categories[0]?.name || 'General')
        ).size,
      };
    } catch {
      state.api = { totalTools: 0, categories: 0 };
    }
  }

  if (sections.includes('economy')) {
    try {
      const { handleEconomyTool } = await import('./economy-tools');
      const usage = await handleEconomyTool('get_usage_summary', { period: 'monthly' });
      state.economy = usage;
    } catch {
      state.economy = { period: 'monthly', summary: { totalCalls: 0 } };
    }
  }

  if (sections.includes('agents')) {
    try {
      const { handleTool } = await import('./handlers');
      const health = await handleTool('get_agent_health', {});
      state.agents = health;
    } catch {
      state.agents = { agents: [], totalRegistered: 0 };
    }
  }

  if (sections.includes('plugins')) {
    try {
      const { handleTool } = await import('./handlers');
      const plugins = await handleTool('list_plugins', {});
      state.plugins = plugins;
    } catch {
      state.plugins = { plugins: [], total: 0 };
    }
  }

  if (sections.includes('compositions')) {
    state.compositions = await handleServePreview({});
  }

  return { dashboard: state, sections, timestamp: new Date().toISOString() };
}
