/**
 * FrameDeclarationTrait tests
 *
 * Covers:
 *  - Handler: onAttach populates __frameDeclaration and emits frame_declared
 *  - Handler: onDetach clears state
 *  - Handler: onEvent frame_check_tool — allowed, blocked by allowlist, blocked by denied domain
 *  - Handler: onEvent frame_check_horizon — within horizon, past horizon
 *  - Handler: onEvent frame_check_tier — within tier, exceeds tier
 *  - API: checkToolAllowed (unit)
 *  - API: checkHorizon (unit)
 *  - API: checkTier (unit)
 *  - Coercer: coerceFrameDeclarationConfig defaults
 *  - G15: [] = no tool, ["*"] = every tool, omitted = every tool
 *    (proposals/Agent_Frame_Tool_Allowlist_v1.md), and the migrated example file
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  frameDeclarationHandler,
  checkToolAllowed,
  checkHorizon,
  checkTier,
  coerceFrameDeclarationConfig,
  type FrameDeclaration,
} from '../FrameDeclarationTrait';
import { HoloScriptPlusParser, type HoloBrainDecl } from '../../parser/HoloScriptPlusParser';
import type { HSPlusNode } from '../TraitTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode & { __frameDeclaration?: FrameDeclaration } {
  return { id: 'test-node', type: 'orb' } as unknown as HSPlusNode;
}

function makeCtx() {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  const ctx = {
    emit: vi.fn((event: string, data: Record<string, unknown>) => {
      events.push({ event, data });
    }),
    events,
  };
  return ctx;
}

const RESTRICTED_FRAME: FrameDeclaration = {
  domain: 'holoscript-language',
  horizon: '2026-06',
  capability_tier: 2,
  trust_tier: 2,
  allowed_tools: ['holo_query_codebase', 'holo_memory_recall'],
  denied_domains: ['finance', 'medical-advice'],
};

const OPEN_FRAME: FrameDeclaration = {
  domain: '*',
  horizon: '',
  capability_tier: 0,
  trust_tier: 0,
  allowed_tools: ['*'],
  denied_domains: [],
};

// ─── coerceFrameDeclarationConfig ─────────────────────────────────────────────

describe('coerceFrameDeclarationConfig', () => {
  it('applies defaults for empty input', () => {
    const frame = coerceFrameDeclarationConfig({});
    expect(frame.domain).toBe('*');
    expect(frame.horizon).toBe('');
    expect(frame.capability_tier).toBe(2);
    expect(frame.trust_tier).toBe(2);
    expect(frame.allowed_tools).toEqual(['*']);
    expect(frame.denied_domains).toEqual([]);
  });

  it('coerces string arrays', () => {
    const frame = coerceFrameDeclarationConfig({
      allowed_tools: ['tool_a', 'tool_b'],
      denied_domains: ['finance'],
    });
    expect(frame.allowed_tools).toEqual(['tool_a', 'tool_b']);
    expect(frame.denied_domains).toEqual(['finance']);
  });

  it('rejects out-of-range tiers and falls back to default', () => {
    const frame = coerceFrameDeclarationConfig({ capability_tier: 99 });
    expect(frame.capability_tier).toBe(2);
  });

  it('accepts valid tier values 0-3', () => {
    for (const t of [0, 1, 2, 3] as const) {
      const frame = coerceFrameDeclarationConfig({ capability_tier: t, trust_tier: t });
      expect(frame.capability_tier).toBe(t);
      expect(frame.trust_tier).toBe(t);
    }
  });

  it('strips non-string entries from array fields', () => {
    const frame = coerceFrameDeclarationConfig({
      allowed_tools: ['good_tool', 42, null, 'another_tool'],
    });
    expect(frame.allowed_tools).toEqual(['good_tool', 'another_tool']);
  });
});

// ─── checkToolAllowed ─────────────────────────────────────────────────────────

describe('checkToolAllowed', () => {
  it('allows a tool in the allowlist', () => {
    const result = checkToolAllowed(RESTRICTED_FRAME, 'holo_query_codebase');
    expect(result.allowed).toBe(true);
  });

  it('blocks a tool not in the allowlist', () => {
    const result = checkToolAllowed(RESTRICTED_FRAME, 'compile_to_unity');
    expect(result.allowed).toBe(false);
    expect(result.violation_type).toBe('tool_not_allowed');
    expect(result.detail).toContain('compile_to_unity');
  });

  it('allows any tool when allowlist is ["*"]', () => {
    const result = checkToolAllowed(OPEN_FRAME, 'compile_to_anything');
    expect(result.allowed).toBe(true);
  });

  it('blocks a tool whose domain_tag is denied', () => {
    const result = checkToolAllowed(RESTRICTED_FRAME, 'some_tool', 'finance');
    expect(result.allowed).toBe(false);
    expect(result.violation_type).toBe('domain_denied');
    expect(result.detail).toContain('finance');
  });

  it('domain_denied takes precedence over allowlist', () => {
    // Even if the tool is in the allowlist, a denied domain blocks it
    const frame: FrameDeclaration = {
      ...RESTRICTED_FRAME,
      allowed_tools: ['special_finance_tool'],
      denied_domains: ['finance'],
    };
    const result = checkToolAllowed(frame, 'special_finance_tool', 'finance');
    expect(result.allowed).toBe(false);
    expect(result.violation_type).toBe('domain_denied');
  });

  it('allows tool with a non-denied domain tag', () => {
    const result = checkToolAllowed(RESTRICTED_FRAME, 'holo_query_codebase', 'holoscript-language');
    expect(result.allowed).toBe(true);
  });
});

// ─── G15: [] = no tool, ["*"] = every tool, omitted = every tool ─────────────
//
// proposals/Agent_Frame_Tool_Allowlist_v1.md. The first test is the one the
// switch-off run flips: put back "empty = every tool" and it fails.

describe('G15 — an empty tool allowlist means no tool; ["*"] means every tool', () => {
  const frameWith = (allowed_tools: string[]): FrameDeclaration => ({
    ...OPEN_FRAME,
    allowed_tools,
  });
  const SAMPLE_TOOLS = ['holo_query_codebase', 'compile_to_unity', 'Bash', 'read', '*'];

  it('a frame with allowed_tools: [] denies every tool', () => {
    for (const tool of SAMPLE_TOOLS) {
      const result = checkToolAllowed(frameWith([]), tool);
      expect(result.allowed, tool).toBe(false);
      expect(result.violation_type, tool).toBe('tool_not_allowed');
      expect(result.detail, tool).toContain('permits no tool');
    }
  });

  it('a frame with allowed_tools: ["*"] allows every tool', () => {
    for (const tool of SAMPLE_TOOLS) {
      expect(checkToolAllowed(frameWith(['*']), tool).allowed, tool).toBe(true);
    }
  });

  it('a frame that omits allowed_tools allows every tool', () => {
    const frame = coerceFrameDeclarationConfig({ domain: 'holoscript-language' });
    expect(frame.allowed_tools).toEqual(['*']);
    for (const tool of SAMPLE_TOOLS) {
      expect(checkToolAllowed(frame, tool).allowed, tool).toBe(true);
    }
  });

  it('a frame with allowed_tools: ["read"] allows only read', () => {
    const frame = frameWith(['read']);
    expect(checkToolAllowed(frame, 'read').allowed).toBe(true);
    for (const tool of ['write', 'Bash', 'compile_to_unity', '*', 'READ', 'read ']) {
      const result = checkToolAllowed(frame, tool);
      expect(result.allowed, tool).toBe(false);
      expect(result.violation_type, tool).toBe('tool_not_allowed');
    }
  });

  it('denied_domains still wins over ["*"] and over a named tool', () => {
    const star: FrameDeclaration = { ...frameWith(['*']), denied_domains: ['finance'] };
    const named: FrameDeclaration = { ...frameWith(['read']), denied_domains: ['finance'] };
    for (const frame of [star, named]) {
      const result = checkToolAllowed(frame, 'read', 'finance');
      expect(result.allowed).toBe(false);
      expect(result.violation_type).toBe('domain_denied');
    }
    expect(checkToolAllowed(star, 'read', 'holoscript-language').allowed).toBe(true);
  });

  it('the coercer keeps a written [] empty instead of widening it', () => {
    const frame = coerceFrameDeclarationConfig({ allowed_tools: [] });
    expect(frame.allowed_tools).toEqual([]);
    expect(checkToolAllowed(frame, 'holo_query_codebase').allowed).toBe(false);
  });

  it('a written value that is not a list fails closed to no tool', () => {
    for (const written of ['holo_query_codebase', '*', null, 42, { tool: '*' }]) {
      const frame = coerceFrameDeclarationConfig({ allowed_tools: written });
      expect(frame.allowed_tools, JSON.stringify(written)).toEqual([]);
      expect(checkToolAllowed(frame, 'holo_query_codebase').allowed, JSON.stringify(written)).toBe(
        false
      );
    }
  });

  it('a list with no string entries fails closed to no tool', () => {
    const frame = coerceFrameDeclarationConfig({ allowed_tools: [42, null, { tool: '*' }] });
    expect(frame.allowed_tools).toEqual([]);
    expect(checkToolAllowed(frame, 'anything').allowed).toBe(false);
  });

  it('a frame object whose allowed_tools is not an array denies (untyped caller)', () => {
    const frame = { ...OPEN_FRAME, allowed_tools: undefined } as unknown as FrameDeclaration;
    expect(checkToolAllowed(frame, 'holo_query_codebase').allowed).toBe(false);
  });

  it('the handler blocks a tool for [] and lets it through when the list is omitted', () => {
    const emptyNode = makeNode();
    const emptyCtx = makeCtx();
    frameDeclarationHandler.onAttach(emptyNode, { allowed_tools: [] }, emptyCtx);
    expect(emptyCtx.events[0].data.summary).toContain('tools=none');
    emptyCtx.events.length = 0;
    frameDeclarationHandler.onEvent(emptyNode, {}, emptyCtx, {
      type: 'frame_check_tool',
      payload: { tool: 'holo_query_codebase' },
    });
    expect(emptyCtx.events.map((e) => e.event)).toEqual(['frame_tool_blocked', 'frame_violation']);

    const omittedNode = makeNode();
    const omittedCtx = makeCtx();
    frameDeclarationHandler.onAttach(omittedNode, {}, omittedCtx);
    expect(omittedCtx.events[0].data.summary).toContain('tools=*');
    omittedCtx.events.length = 0;
    frameDeclarationHandler.onEvent(omittedNode, {}, omittedCtx, {
      type: 'frame_check_tool',
      payload: { tool: 'holo_query_codebase' },
    });
    expect(omittedCtx.events).toHaveLength(0);
  });

  it('the handler default config is ["*"], every tool', () => {
    expect(frameDeclarationHandler.defaultConfig.allowed_tools).toEqual(['*']);
  });
});

// ─── The migrated example: compositions/frame-declaration-example.hsplus ─────
//
// Neither reader parses the whole example file today (the Rust reader has no
// `brain` syntax; this reader refuses its `#version` header and its
// `transition … @when` lines), so each brain's frame block is cut out of the
// real file and read by the canonical .hsplus parser inside a minimal brain.

describe('frame-declaration-example.hsplus after the G15 migration', () => {
  const example = readFileSync(
    resolve(import.meta.dirname, '../../../../../compositions/frame-declaration-example.hsplus'),
    'utf8'
  );

  function frameOf(brainName: string): FrameDeclaration {
    const brainAt = example.indexOf(`brain ${brainName}`);
    expect(brainAt, brainName).toBeGreaterThanOrEqual(0);
    const blockAt = example.indexOf('@frame_declaration {', brainAt);
    const block = example.slice(blockAt, example.indexOf('}', blockAt) + 1);
    const result = new HoloScriptPlusParser({ enableVRTraits: true }).parse(
      `brain ${brainName} : @behavior_tree {\n  ${block}\n}`
    );
    expect(result.success, brainName).toBe(true);
    const brain = result.ast.root as unknown as HoloBrainDecl;
    expect(brain.frameDeclaration, brainName).toBeDefined();
    return brain.frameDeclaration as FrameDeclaration;
  }

  it('TrustedAnalyst still allows every tool', () => {
    const frame = frameOf('TrustedAnalyst');
    expect(frame.allowed_tools).toEqual(['*']);
    for (const tool of ['holo_query_codebase', 'compile_to_unity', 'Bash', 'hs_ai_fix_code']) {
      expect(checkToolAllowed(frame, tool).allowed, tool).toBe(true);
    }
  });

  it('HoloScriptSpecialist and JetsonEdgeAgent keep exactly their named tools', () => {
    const specialist = frameOf('HoloScriptSpecialist');
    expect(specialist.allowed_tools).toHaveLength(7);
    expect(checkToolAllowed(specialist, 'holo_query_codebase').allowed).toBe(true);
    expect(checkToolAllowed(specialist, 'compile_to_unity').allowed).toBe(false);

    const edge = frameOf('JetsonEdgeAgent');
    expect(edge.allowed_tools).toEqual([
      'holo_memory_recall',
      'holo_memory_store',
      'hs_diagnostics',
    ]);
    expect(checkToolAllowed(edge, 'hs_diagnostics').allowed).toBe(true);
    expect(checkToolAllowed(edge, 'holo_query_codebase').allowed).toBe(false);
  });
});

// ─── checkHorizon ─────────────────────────────────────────────────────────────

describe('checkHorizon', () => {
  it('allows a date within the monthly horizon', () => {
    const result = checkHorizon(RESTRICTED_FRAME, '2026-06-15');
    expect(result.allowed).toBe(true);
  });

  it('allows the last day of the horizon month', () => {
    const result = checkHorizon(RESTRICTED_FRAME, '2026-06-30');
    expect(result.allowed).toBe(true);
  });

  it('blocks a date after the horizon month', () => {
    const result = checkHorizon(RESTRICTED_FRAME, '2026-07-01');
    expect(result.allowed).toBe(false);
    expect(result.violation_type).toBe('horizon_exceeded');
    expect(result.detail).toContain('2026-07-01');
  });

  it('blocks a date well after horizon', () => {
    const result = checkHorizon(RESTRICTED_FRAME, '2027-01-01');
    expect(result.allowed).toBe(false);
  });

  it('allows any date when horizon is empty', () => {
    const result = checkHorizon(OPEN_FRAME, '2099-12-31');
    expect(result.allowed).toBe(true);
  });

  it('allows any date when horizon is "*"', () => {
    const frame: FrameDeclaration = { ...RESTRICTED_FRAME, horizon: '*' };
    const result = checkHorizon(frame, '2099-12-31');
    expect(result.allowed).toBe(true);
  });

  it('handles year-only horizon', () => {
    const frame: FrameDeclaration = { ...RESTRICTED_FRAME, horizon: '2026' };
    expect(checkHorizon(frame, '2026-12-31').allowed).toBe(true);
    expect(checkHorizon(frame, '2027-01-01').allowed).toBe(false);
  });

  it('handles full date horizon', () => {
    const frame: FrameDeclaration = { ...RESTRICTED_FRAME, horizon: '2026-06-21' };
    expect(checkHorizon(frame, '2026-06-21').allowed).toBe(true);
    expect(checkHorizon(frame, '2026-06-22').allowed).toBe(false);
  });

  it('skips check on unparseable claimed date', () => {
    const result = checkHorizon(RESTRICTED_FRAME, 'not-a-date');
    expect(result.allowed).toBe(true);
  });
});

// ─── checkTier ────────────────────────────────────────────────────────────────

describe('checkTier', () => {
  it('allows when required tier equals declared tier', () => {
    const result = checkTier(RESTRICTED_FRAME, 2);
    expect(result.allowed).toBe(true);
  });

  it('allows when required tier is lower privilege (higher number)', () => {
    // Agent is tier 2, action requires tier 3 — tier 3 is LESS privileged, so allowed
    const result = checkTier(RESTRICTED_FRAME, 3);
    expect(result.allowed).toBe(true);
  });

  it('blocks when required tier is higher privilege (lower number)', () => {
    // Agent is tier 2, action requires tier 1 (more privileged) — blocked
    const result = checkTier(RESTRICTED_FRAME, 1);
    expect(result.allowed).toBe(false);
    expect(result.violation_type).toBe('tier_exceeded');
    expect(result.detail).toContain('tier 2');
  });

  it('allows sovereign tier-0 agent to do anything', () => {
    const result = checkTier(OPEN_FRAME, 0);
    expect(result.allowed).toBe(true);
  });
});

// ─── Handler: onAttach / onDetach ─────────────────────────────────────────────

describe('frameDeclarationHandler.onAttach', () => {
  it('stores frame on node and emits frame_declared', () => {
    const node = makeNode();
    const ctx = makeCtx();

    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);

    expect(node.__frameDeclaration).toBeDefined();
    expect(node.__frameDeclaration?.domain).toBe('holoscript-language');
    expect(node.__frameDeclaration?.horizon).toBe('2026-06');
    expect(node.__frameDeclaration?.capability_tier).toBe(2);
    expect(node.__frameDeclaration?.allowed_tools).toContain('holo_query_codebase');

    expect(ctx.emit).toHaveBeenCalledWith(
      'frame_declared',
      expect.objectContaining({
        node,
        frame: expect.objectContaining({ domain: 'holoscript-language' }),
      })
    );
  });

  it('applies defaults for missing config fields', () => {
    const node = makeNode();
    const ctx = makeCtx();

    frameDeclarationHandler.onAttach(node, {}, ctx);

    expect(node.__frameDeclaration?.domain).toBe('*');
    expect(node.__frameDeclaration?.capability_tier).toBe(2);
  });
});

describe('frameDeclarationHandler.onDetach', () => {
  it('removes __frameDeclaration from node', () => {
    const node = makeNode();
    const ctx = makeCtx();

    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    expect(node.__frameDeclaration).toBeDefined();

    frameDeclarationHandler.onDetach(node, RESTRICTED_FRAME, ctx);
    expect(node.__frameDeclaration).toBeUndefined();
  });
});

// ─── Handler: onEvent — frame_check_tool ──────────────────────────────────────

describe('frameDeclarationHandler.onEvent — frame_check_tool', () => {
  it('emits nothing when tool is allowed', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0; // clear attach events

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tool',
      payload: { tool: 'holo_query_codebase' },
    });

    const violations = ctx.events.filter((e) => e.event === 'frame_violation');
    expect(violations).toHaveLength(0);
  });

  it('emits frame_tool_blocked + frame_violation when tool not in allowlist', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tool',
      payload: { tool: 'compile_to_unity' },
    });

    expect(ctx.events.some((e) => e.event === 'frame_tool_blocked')).toBe(true);
    const violation = ctx.events.find((e) => e.event === 'frame_violation');
    expect(violation).toBeDefined();
    expect(violation?.data.violation_type).toBe('tool_not_allowed');
    expect(violation?.data.tool).toBe('compile_to_unity');
  });

  it('emits frame_domain_blocked + frame_violation when domain is denied', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tool',
      payload: { tool: 'holo_query_codebase', domain_tag: 'finance' },
    });

    expect(ctx.events.some((e) => e.event === 'frame_domain_blocked')).toBe(true);
    const violation = ctx.events.find((e) => e.event === 'frame_violation');
    expect(violation?.data.violation_type).toBe('domain_denied');
  });

  it('emits undeclared_frame violation when state is missing', () => {
    const node = makeNode(); // no __frameDeclaration
    const ctx = makeCtx();

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tool',
      payload: { tool: 'any_tool' },
    });

    const violation = ctx.events.find((e) => e.event === 'frame_violation');
    expect(violation?.data.violation_type).toBe('undeclared_frame');
  });
});

// ─── Handler: onEvent — frame_check_horizon ───────────────────────────────────

describe('frameDeclarationHandler.onEvent — frame_check_horizon', () => {
  it('emits nothing for a date within horizon', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_horizon',
      payload: { claimed_date: '2026-05-01' },
    });

    expect(ctx.events.filter((e) => e.event === 'frame_violation')).toHaveLength(0);
  });

  it('emits frame_horizon_exceeded + frame_violation for post-horizon date', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_horizon',
      payload: { claimed_date: '2026-09-15' },
    });

    expect(ctx.events.some((e) => e.event === 'frame_horizon_exceeded')).toBe(true);
    const violation = ctx.events.find((e) => e.event === 'frame_violation');
    expect(violation?.data.violation_type).toBe('horizon_exceeded');
  });
});

// ─── Handler: onEvent — frame_check_tier ──────────────────────────────────────

describe('frameDeclarationHandler.onEvent — frame_check_tier', () => {
  it('emits nothing when required tier is within declared tier', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tier',
      payload: { required_tier: 2 },
    });

    expect(ctx.events.filter((e) => e.event === 'frame_violation')).toHaveLength(0);
  });

  it('emits frame_tier_exceeded + frame_violation when tier is insufficient', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tier',
      payload: { required_tier: 0 },
    });

    expect(ctx.events.some((e) => e.event === 'frame_tier_exceeded')).toBe(true);
    const violation = ctx.events.find((e) => e.event === 'frame_violation');
    expect(violation?.data.violation_type).toBe('tier_exceeded');
  });

  it('ignores invalid tier values', () => {
    const node = makeNode();
    const ctx = makeCtx();
    frameDeclarationHandler.onAttach(node, RESTRICTED_FRAME, ctx);
    ctx.events.length = 0;

    frameDeclarationHandler.onEvent(node, RESTRICTED_FRAME, ctx, {
      type: 'frame_check_tier',
      payload: { required_tier: 99 }, // invalid — not 0|1|2|3
    });

    expect(ctx.events.filter((e) => e.event === 'frame_violation')).toHaveLength(0);
  });
});

// ─── Handler: name constant ───────────────────────────────────────────────────

describe('frameDeclarationHandler.name', () => {
  it('is "frame_declaration"', () => {
    expect(frameDeclarationHandler.name).toBe('frame_declaration');
  });
});
