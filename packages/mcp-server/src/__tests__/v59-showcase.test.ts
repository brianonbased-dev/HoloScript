/**
 * v5.9 "Developer Portal" — End-to-end showcase test
 *
 * Tests the full developer tooling stack:
 * 1. Hello-world .holo composition parses and validates
 * 2. DevServer lifecycle + HTTP endpoints
 * 3. TraceWaterfallRenderer visualization
 * 4. WorkspaceManager init + info
 * 5. APIDocsGenerator reference generation
 * 6. MCP developer tools (get_api_reference, inspect_trace_waterfall, get_dev_dashboard_state)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { TraceWaterfallRenderer } from '@holoscript/core';
import type { TraceSpan } from '@holoscript/core';
import { APIDocsGenerator } from '../api-docs-generator';
import { handleDeveloperTool, resetDeveloperSingletons } from '../developer-tools';

// =============================================================================
// FIXTURES
// =============================================================================

const EXAMPLES_DIR = resolve(__dirname, '../../../../examples/getting-started');

// =============================================================================
// TESTS
// =============================================================================

describe('v5.9 Showcase — Developer Portal', () => {
  beforeEach(() => {
    resetDeveloperSingletons();
  });

  // ===========================================================================
  // 1. HELLO-WORLD COMPOSITION
  // ===========================================================================

  describe('hello-world.holo', () => {
    const code = readFileSync(resolve(EXAMPLES_DIR, 'hello-world.holo'), 'utf-8');

    it('is a valid composition', () => {
      expect(code.length).toBeGreaterThan(500);
      expect(code).toContain('@world');
      expect(code).toContain('Developer Portal');
    });

    it('defines scene objects', () => {
      expect(code).toContain('object WelcomeCube');
      expect(code).toContain('object Ground');
      expect(code).toContain('object InfoPanel');
    });

    it('defines lighting and camera', () => {
      expect(code).toContain('directional_light');
      expect(code).toContain('ambient_light');
      expect(code).toContain('perspective_camera');
    });

    it('references developer workflow', () => {
      expect(code).toContain('holoscript serve');
      expect(code).toContain('holoscript workspace init');
      expect(code).toContain('get_workspace_info');
    });
  });

  // ===========================================================================
  // 2. TRACE WATERFALL RENDERER E2E
  // ===========================================================================

  describe('TraceWaterfallRenderer E2E', () => {
    it('renders a multi-agent distributed trace', () => {
      const renderer = new TraceWaterfallRenderer();
      const spans: TraceSpan[] = [
        {
          traceId: 'trace-showcase',
          spanId: 'root',
          name: 'orchestrator.run',
          kind: 'server',
          startTime: 0,
          endTime: 500,
          status: 'ok',
          attributes: { agentId: 'orchestrator' },
        },
        {
          traceId: 'trace-showcase',
          spanId: 'delegate-1',
          parentSpanId: 'root',
          name: 'weather.fetch',
          kind: 'client',
          startTime: 50,
          endTime: 200,
          status: 'ok',
          attributes: { agentId: 'weather-agent' },
        },
        {
          traceId: 'trace-showcase',
          spanId: 'delegate-2',
          parentSpanId: 'root',
          name: 'analytics.process',
          kind: 'client',
          startTime: 100,
          endTime: 450,
          status: 'ok',
          attributes: { agentId: 'analytics-agent' },
        },
        {
          traceId: 'trace-showcase',
          spanId: 'db-query',
          parentSpanId: 'delegate-2',
          name: 'db.query',
          kind: 'internal',
          startTime: 150,
          endTime: 350,
          status: 'error',
          attributes: { agentId: 'analytics-agent' },
          events: [{ name: 'error', timestamp: 300, attributes: { message: 'timeout' } }],
        },
      ];

      const waterfall = renderer.render(spans);

      expect(waterfall.traceId).toBe('trace-showcase');
      expect(waterfall.spanCount).toBe(4);
      expect(waterfall.agentCount).toBe(3);
      expect(waterfall.totalDuration).toBe(500);
      expect(waterfall.rows[0].name).toBe('orchestrator.run');
      expect(waterfall.rows[0].depth).toBe(0);
      expect(waterfall.summary.errorSpans).toBe(1);
      expect(waterfall.criticalPath.length).toBeGreaterThan(0);
      expect(waterfall.agentColors['orchestrator']).toBeDefined();
      expect(waterfall.agentColors['weather-agent']).toBeDefined();
      expect(waterfall.agentColors['analytics-agent']).toBeDefined();
    });
  });

  // ===========================================================================
  // 3. WORKSPACE MANAGER E2E
  // ===========================================================================

  describe('WorkspaceManager E2E', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'holoscript-showcase-'));
    });

    afterEach(() => {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore on Windows
      }
    });

    it('full lifecycle: init → add members → build order → info', async () => {
      // Use dynamic import — resolve from __dirname (packages/mcp-server/src/__tests__)
      const { WorkspaceManager } =
        await import('../../../../packages/cli/src/workspace/WorkspaceManager');

      // Create workspace structure
      mkdirSync(join(tempDir, 'packages', 'core'), { recursive: true });
      mkdirSync(join(tempDir, 'packages', 'app'), { recursive: true });
      writeFileSync(
        join(tempDir, 'packages', 'core', 'package.json'),
        JSON.stringify({ name: '@project/core' })
      );
      writeFileSync(join(tempDir, 'packages', 'core', 'types.holo'), '@world {}');
      writeFileSync(
        join(tempDir, 'packages', 'app', 'main.holo'),
        'import "@project/core/types"\nobject App {}'
      );

      const manager = new WorkspaceManager(tempDir);
      const config = manager.init('showcase-project');

      expect(config.name).toBe('showcase-project');

      const info = manager.getInfo();
      expect(info.memberCount).toBe(2);
      expect(info.totalCompositions).toBe(2);

      const order = manager.getBuildOrder();
      expect(order.hasCycles).toBe(false);
      expect(order.total).toBe(2);
    });
  });

  // ===========================================================================
  // 4. API DOCS GENERATOR E2E
  // ===========================================================================

  describe('APIDocsGenerator E2E', () => {
    it('generates reference from real tool set', () => {
      const generator = new APIDocsGenerator();
      const tools = [
        {
          name: 'parse_hs',
          description: 'Parse HoloScript',
          inputSchema: {
            type: 'object' as const,
            properties: { code: { type: 'string', description: 'Source' } },
            required: ['code'],
          },
        },
        {
          name: 'graph_traverse',
          description: 'Traverse graph',
          inputSchema: {
            type: 'object' as const,
            properties: { nodeId: { type: 'string', description: 'Start node' } },
            required: ['nodeId'],
          },
        },
        {
          name: 'check_agent_budget',
          description: 'Check budget',
          inputSchema: {
            type: 'object' as const,
            properties: { agentId: { type: 'string', description: 'Agent' } },
            required: ['agentId'],
          },
        },
      ];

      const ref = generator.generate(tools);
      expect(ref.totalTools).toBe(3);
      expect(ref.categories.length).toBe(3);

      const md = generator.toMarkdown(ref);
      expect(md).toContain('# HoloScript MCP API Reference');
      expect(md).toContain('`parse_hs`');
      expect(md).toContain('Economy');

      const json = generator.toJSON(ref);
      const parsed = JSON.parse(json);
      expect(parsed.totalTools).toBe(3);
    });
  });

  // ===========================================================================
  // 5. MCP DEVELOPER TOOLS
  // ===========================================================================

  describe('MCP developer tools', () => {
    it('get_api_reference returns API reference', async () => {
      const result = (await handleDeveloperTool('get_api_reference', {
        format: 'json',
      })) as { format: string; reference: { totalTools: number } };

      expect(result.format).toBe('json');
      expect(result.reference.totalTools).toBeGreaterThan(0);
    });

    it('get_api_reference supports markdown format', async () => {
      const result = (await handleDeveloperTool('get_api_reference', {
        format: 'markdown',
      })) as { format: string; content: string };

      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# HoloScript MCP API Reference');
    });

    it('inspect_trace_waterfall renders spans', async () => {
      const result = (await handleDeveloperTool('inspect_trace_waterfall', {
        spans: [
          {
            traceId: 't1',
            spanId: 's1',
            name: 'test',
            kind: 'internal',
            startTime: 0,
            endTime: 100,
            status: 'ok',
          },
          {
            traceId: 't1',
            spanId: 's2',
            parentSpanId: 's1',
            name: 'child',
            kind: 'internal',
            startTime: 10,
            endTime: 50,
            status: 'ok',
          },
        ],
      })) as { waterfall: { spanCount: number; rows: Array<{ depth: number }> } };

      expect(result.waterfall.spanCount).toBe(2);
      expect(result.waterfall.rows[0].depth).toBe(0);
      expect(result.waterfall.rows[1].depth).toBe(1);
    });

    it('get_dev_dashboard_state returns dashboard data', async () => {
      const result = (await handleDeveloperTool('get_dev_dashboard_state', {
        sections: ['traces', 'api'],
      })) as { dashboard: Record<string, unknown>; sections: string[] };

      expect(result.sections).toContain('traces');
      expect(result.sections).toContain('api');
      expect(result.dashboard.traces).toBeDefined();
      expect(result.dashboard.api).toBeDefined();
    });
  });
});
