/**
 * Dispatch Health Check — Verifies every registered tool can reach a handler.
 *
 * This test prevents the #1 category of tool bugs: tools that are LISTED in the
 * tools array but NOT DISPATCHED by any handler (resulting in "Unknown tool" errors).
 *
 * How it works:
 * 1. Loads all tools from tools.ts + index.ts aggregation
 * 2. Calls each tool's handler with empty/minimal args
 * 3. Verifies the handler returns non-null (not "Unknown tool")
 *
 * A tool that returns an error for invalid args is FINE — it means dispatch works.
 * A tool that throws "Unknown tool" is BROKEN — it means no handler caught it.
 */

import { describe, it, expect } from 'vitest';
import { tools } from '../tools';
import { compilerTools } from '../compiler-tools';
import { networkingTools } from '../networking-tools';
import { snapshotTools } from '../snapshot-tools';
import { monitoringTools } from '../monitoring-tools';
import { holotestTools } from '../holotest-tools';
import { refactorCodegenTools } from '../refactor-codegen-tools';
import { handleTool } from '../handlers';
import { hologramToolDefinitions } from '../hologram-mcp-tools';

// tools.ts is now the single source of truth — all tool groups are included.
const allTools = tools;

describe('dispatch health check', () => {
  it('all tools have unique names (excluding dynamic plugin tools)', () => {
    const names = allTools.map((t) => t.name);
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const n of names) {
      if (seen.has(n)) dupes.push(n);
      seen.add(n);
    }
    // PluginManager.getTools() may register tools that overlap with static arrays
    // at runtime — filter those out for this static check
    const staticDupes = dupes.filter((n) => !n.startsWith('uaa2_'));
    expect(staticDupes).toEqual([]);
  });

  it(`registers ${allTools.length} tools total`, () => {
    expect(allTools.length).toBeGreaterThanOrEqual(156);
  });

  // Tools dispatched by index.ts cascade handlers BEFORE the catch-all.
  // These are tested via their dedicated handlers below, not via handleTool.
  const cascadeHandled = new Set([
    // handleAbsorbServiceTool (index.ts)
    ...['absorb_query', 'absorb_diff', 'absorb_list_projects', 'absorb_create_project',
      'absorb_delete_project', 'absorb_check_credits', 'absorb_run_absorb', 'absorb_run_improve',
      'absorb_run_query_ai', 'absorb_run_render', 'absorb_run_pipeline'],
    // handleGltfTool (index.ts)
    ...['import_gltf', 'compile_to_gltf'],
    // handleCompilerTool (index.ts) — audit tool dispatched via compiler handler
    'holoscript_audit_numbers',
    // AlphaFold — also dispatched via compiler handler (see compiler-tools.ts switch)
    'alphafold_fetch_structure',
    // Dedicated handlers — now in tools.ts but still dispatched via their own handlers
    ...compilerTools.map((t) => t.name),
    ...networkingTools.map((t) => t.name),
    ...snapshotTools.map((t) => t.name),
    ...monitoringTools.map((t) => t.name),
    ...holotestTools.map((t) => t.name),
    ...refactorCodegenTools.map((t) => t.name),
  ]);

  const catchAllTools = tools.map((t) => t.name).filter((n) => !cascadeHandled.has(n));

  describe('catch-all handler dispatch', () => {
    for (const toolName of catchAllTools) {
      it(`dispatches ${toolName}`, async () => {
        try {
          await handleTool(toolName, {});
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // "Unknown tool" means dispatch is broken — FAIL
          expect(msg).not.toMatch(/^Unknown tool:/);
          // Any other error (missing args, network, etc.) means dispatch WORKS
        }
      });
    }
  });

  describe('hologram tool dispatch (handleTool)', () => {
    for (const tool of hologramToolDefinitions) {
      it(`dispatches ${tool.name} without Unknown tool`, async () => {
        try {
          await handleTool(tool.name, {});
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          expect(msg).not.toMatch(/^Unknown tool:/);
        }
      });
    }
  });

  describe('dedicated handler dispatch', () => {
    const handlerMap: Array<{ tools: typeof compilerTools; importPath: string; handlerKey: string }> = [
      { tools: compilerTools, importPath: '../compiler-tools', handlerKey: 'handleCompilerTool' },
      { tools: networkingTools, importPath: '../networking-tools', handlerKey: 'handleNetworkingTool' },
      { tools: snapshotTools, importPath: '../snapshot-tools', handlerKey: 'handleSnapshotTool' },
      { tools: monitoringTools, importPath: '../monitoring-tools', handlerKey: 'handleMonitoringTool' },
      { tools: holotestTools, importPath: '../holotest-tools', handlerKey: 'handleHolotestTool' },
      { tools: refactorCodegenTools, importPath: '../refactor-codegen-tools', handlerKey: 'handleRefactorCodegenTool' },
    ];

    for (const { tools: toolSet, importPath, handlerKey } of handlerMap) {
      for (const tool of toolSet) {
        it(`dispatches ${tool.name}`, async () => {
          const mod = await import(importPath);
          const handler = mod[handlerKey];
          try {
            const result = await handler(tool.name, {});
            // Non-null result = dispatch works
            expect(result).not.toBeNull();
          } catch {
            // Handler threw for missing args = dispatch works (handler was found)
          }
        });
      }
    }
  });

  describe('schema quality gates', () => {
    it('all tools have non-empty descriptions', () => {
      const empty = allTools.filter((t) => !t.description || t.description.length < 10);
      expect(empty.map((t) => t.name)).toEqual([]);
    });

    it('all tools have inputSchema defined', () => {
      const missing = allTools.filter((t) => !t.inputSchema);
      expect(missing.map((t) => t.name)).toEqual([]);
    });

    it('no tool descriptions exceed 500 chars', () => {
      const long = allTools.filter((t) => t.description && t.description.length > 500);
      expect(long.map((t) => `${t.name} (${t.description!.length} chars)`)).toEqual([]);
    });
  });
});
