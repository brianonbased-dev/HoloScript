/**
 * SkillRegistryTrait.test.ts — v4.0
 * Tests: builtin skills, install, invoke, uninstall, timeout, stats
 */
import { describe, it, expect, vi } from 'vitest';
import { skillRegistryHandler } from '../SkillRegistryTrait';
import type { SkillRegistryConfig } from '../SkillRegistryTrait';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter(e => e.type === type),
  };
}

const BASE_CONFIG: SkillRegistryConfig = {
  max_skills: 50,
  timeout_ms: 5000,
  allow_shell: false,
  allow_fs: false,
  allow_fetch: true,
  allowed_domains: [],
};

function attach(extra: Partial<SkillRegistryConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  skillRegistryHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('SkillRegistryTrait — onAttach', () => {
  it('emits skills_ready', () => {
    const { ctx } = attach();
    expect(ctx.of('skills_ready').length).toBe(1);
  });

  it('registers built-in skills on attach (web_fetch when allow_fetch)', () => {
    const { node } = attach({ allow_fetch: true });
    expect(node.__skillRegistryState.skills.has('web_fetch')).toBe(true);
  });

  it('registers json_transform (always available)', () => {
    const { node } = attach();
    expect(node.__skillRegistryState.skills.has('json_transform')).toBe(true);
  });

  it('registers text_truncate (always available)', () => {
    const { node } = attach();
    expect(node.__skillRegistryState.skills.has('text_truncate')).toBe(true);
  });

  it('does not register web_fetch when allow_fetch=false', () => {
    const { node } = attach({ allow_fetch: false });
    expect(node.__skillRegistryState.skills.has('web_fetch')).toBe(false);
  });
});

// ─── Install ─────────────────────────────────────────────────────────────────

describe('SkillRegistryTrait — install', () => {
  it('installs a custom skill', () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_install',
      payload: {
        id: 'custom_greet', name: 'Greeter', description: 'Says hello',
        inputs: [{ name: 'name', type: 'string', required: true, description: 'Name' }],
        outputs: [],
        execute: async (inputs: any) => ({ greeting: `Hello, ${inputs.name}!` }),
      },
    });
    expect(ctx.of('skill_installed').length).toBe(1);
    expect(node.__skillRegistryState.skills.has('custom_greet')).toBe(true);
  });

  it('rejects install without execute function', () => {
    const { ctx, config, node } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_install',
      payload: { id: 'bad', name: 'Bad', execute: null },
    });
    expect(ctx.of('skill_installed').length).toBe(0);
    expect(ctx.of('skill_failed').length).toBe(1);
  });

  it('enforces max_skills limit', () => {
    const { node, ctx, config } = attach({ max_skills: 3, allow_fetch: false });
    // Remove all builtins and jam till full
    for (let i = 0; i < 5; i++) {
      skillRegistryHandler.onEvent(node, config, ctx, {
        type: 'skill_install',
        payload: { id: `s${i}`, name: `Skill${i}`, execute: async () => ({}) },
      });
    }
    expect(node.__skillRegistryState.skills.size).toBeLessThanOrEqual(3);
    expect(ctx.of('skill_failed').some((e: any) => e.payload.error?.includes('max_skills'))).toBe(true);
  });
});

// ─── Uninstall ───────────────────────────────────────────────────────────────

describe('SkillRegistryTrait — uninstall', () => {
  it('uninstalls a skill', () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_install',
      payload: { id: 'rm_me', name: 'Remove Me', execute: async () => ({}) },
    });
    skillRegistryHandler.onEvent(node, config, ctx, { type: 'skill_uninstall', payload: { skillId: 'rm_me' } });
    expect(node.__skillRegistryState.skills.has('rm_me')).toBe(false);
    expect(ctx.of('skill_uninstalled').length).toBe(1);
  });

  it('ignores uninstall for unknown skill', () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, { type: 'skill_uninstall', payload: { skillId: 'ghost' } });
    expect(ctx.of('skill_uninstalled').length).toBe(0);
  });
});

// ─── Invoke ───────────────────────────────────────────────────────────────────

describe('SkillRegistryTrait — invoke', () => {
  it('invokes json_transform successfully', async () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_invoke',
      payload: { skillId: 'json_transform', inputs: { json: '{"name":"Alice"}', path: 'name' }, invocationId: 'inv1' },
    });
    await vi.waitUntil(() => ctx.of('skill_result').length > 0);
    const result = (ctx.of('skill_result')[0].payload as any).result;
    expect(result.result).toBe('Alice');
  });

  it('invokes text_truncate', async () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_invoke',
      payload: { skillId: 'text_truncate', inputs: { text: 'a'.repeat(1000), max_chars: 10 } },
    });
    await vi.waitUntil(() => ctx.of('skill_result').length > 0);
    const r = (ctx.of('skill_result')[0].payload as any).result;
    expect((r.text as string).length).toBeLessThanOrEqual(11); // 10 + ellipsis
    expect(r.truncated).toBe(true);
  });

  it('emits skill_invoked before result', async () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_invoke',
      payload: { skillId: 'text_truncate', inputs: { text: 'short', max_chars: 100 } },
    });
    await vi.waitUntil(() => ctx.of('skill_result').length > 0);
    expect(ctx.of('skill_invoked').length).toBe(1);
  });

  it('emits skill_failed for unknown skill', async () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, { type: 'skill_invoke', payload: { skillId: 'ghost', inputs: {} } });
    await vi.waitUntil(() => ctx.of('skill_failed').length > 0);
    expect((ctx.of('skill_failed')[0].payload as any).error).toContain('Unknown skill');
  });

  it('validates required inputs', async () => {
    const { node, ctx, config } = attach();
    // json_transform requires `json` input
    skillRegistryHandler.onEvent(node, config, ctx, { type: 'skill_invoke', payload: { skillId: 'json_transform', inputs: {} } });
    await vi.waitUntil(() => ctx.of('skill_failed').length > 0);
    expect((ctx.of('skill_failed')[0].payload as any).error).toContain('Missing required input');
  });

  it('invokes custom skill and returns result', async () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_install',
      payload: { id: 'add', name: 'Add', inputs: [], outputs: [], execute: async (inp: any) => ({ sum: inp.a + inp.b }) },
    });
    skillRegistryHandler.onEvent(node, config, ctx, {
      type: 'skill_invoke',
      payload: { skillId: 'add', inputs: { a: 3, b: 7 } },
    });
    await vi.waitUntil(() => ctx.of('skill_result').length > 0);
    expect((ctx.of('skill_result')[0].payload as any).result.sum).toBe(10);
  });
});

// ─── List & Stats ─────────────────────────────────────────────────────────────

describe('SkillRegistryTrait — list & stats', () => {
  it('lists skills', () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, { type: 'skill_list' });
    const skills = (ctx.of('skills_listed')[0].payload as any).skills;
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.some((s: any) => s.id === 'text_truncate')).toBe(true);
  });

  it('returns skill stats', () => {
    const { node, ctx, config } = attach();
    skillRegistryHandler.onEvent(node, config, ctx, { type: 'skill_stats' });
    const stats = (ctx.of('skill_stats')[0].payload as any);
    expect(typeof stats.total).toBe('number');
    expect(stats.totalInvocations).toBe(0);
  });
});
