import { describe, expect, it } from 'vitest';
import { tools } from '../tools';
import {
  fromScratchToolDefinitions,
  handleFromScratchTool,
  isFromScratchToolName,
} from '../from-scratch-mcp-tools';

const TOOL_NAMES = ['holo_from_scratch_status', 'holo_from_scratch_launch'];

describe('from-scratch MCP tools', () => {
  it('exports both tool definitions and registers them in tools.ts', () => {
    expect(fromScratchToolDefinitions.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    for (const name of TOOL_NAMES) {
      expect(isFromScratchToolName(name)).toBe(true);
      expect(tools.some((tool) => tool.name === name)).toBe(true);
    }
    expect(isFromScratchToolName('holo_from_scratch_bogus')).toBe(false);
  });

  it('requires a model id for launch (before any spend or dispatch)', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {})) as Record<
      string,
      unknown
    >;
    expect(result.ok).toBe(false);
    // Either model-required (reachable CLI) or ai-ecosystem-unreachable (no checkout) —
    // both short-circuit before any GPU spend. In neither case is a launch dispatched.
    expect(['model-required', 'ai-ecosystem-unreachable']).toContain(result.error);
  });

  it('rejects an unsafe model id', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      model: 'bad id; rm -rf /',
    })) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    expect(['invalid-model-id', 'ai-ecosystem-unreachable']).toContain(result.error);
  });

  // The from-scratch surface resolves the ai-ecosystem CLI via AI_ECOSYSTEM_ROOT
  // and then falls back to ~/.ai-ecosystem. On a sovereign LOCAL MCP that checkout
  // exists (CLI reachable); on a remote / CI box it does not (CLI unreachable). Both
  // are valid production states, so these tests assert the correct branch for
  // whichever environment they run in — the invariant in EITHER case is: a non-dry
  // launch never spends without both an ai-ecosystem checkout AND a founder gate.
  it('never spends on a non-dry launch without a founder gate (reachable or not)', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      model: 'holorunner-s0',
      apply: true,
    })) as Record<string, unknown>;
    expect(result.ok).toBe(false);
    // Reachable checkout → gated at the MCP boundary; unreachable → failed before dispatch.
    // Neither path reaches an --apply --yes-spend delegation.
    expect(['founder-gate-required', 'ai-ecosystem-unreachable']).toContain(result.error);
    expect(result.spendIntent).not.toBe(true);
  });

  // NOTE: this test must never trigger a real GPU launch. It keeps dryRun:true so
  // the handler previews via the CLI's own dry-run (no --apply, no --yes-spend, no
  // spend) — while still exercising the safe preview branch end to end.
  it('previews a dry-run launch without spending (reachable or unreachable)', async () => {
    const result = (await handleFromScratchTool('holo_from_scratch_launch', {
      model: 'holorunner-s0',
      dryRun: true,
    })) as Record<string, unknown>;
    if (result.error === 'ai-ecosystem-unreachable') {
      // Remote / CI box with no checkout — honest failure, no spend.
      expect(result.ok).toBe(false);
    } else {
      // Local sovereign MCP — the CLI dry-run ran; spendIntent is explicitly false.
      expect(result.dryRun).toBe(true);
      expect(result.spendIntent).toBe(false);
      expect(String(result.previewCommand)).not.toContain('--yes-spend');
    }
  });

  it('returns null for an unknown tool name', async () => {
    const result = await handleFromScratchTool('not_a_from_scratch_tool', {});
    expect(result).toBeNull();
  });
});
