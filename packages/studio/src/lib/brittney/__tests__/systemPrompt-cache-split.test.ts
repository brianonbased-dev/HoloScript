/**
 * Fixed-instruction cache split.
 *
 * The Anthropic breakpoint must cover only the stable instruction set.
 * The chat panel sends live workspace state and the scene as one string.
 * That string, plus profile, GitHub, past threads, and the per-turn caching
 * declaration, stays in the suffix so it does not rewrite the cache entry.
 * Founder mode and the simulation guidance are part of the instruction set:
 * they change the prefix, so they get their own entry.
 */

import { describe, it, expect } from 'vitest';
import {
  buildContextualPrompt,
  buildContextualPromptParts,
  type BrittneySystemPromptParts,
} from '../systemPrompt';
import type { PastThreadSnippet } from '../pastThreads';
import { buildWorkspaceAssistantContext } from '../workspaceContext';

const THREAD: PastThreadSnippet = {
  id: 't1',
  title: 'Earlier thread',
  lastMessageAt: '2026-09-01T00:00:00.000Z',
  messageCount: 3,
  excerpts: ['we talked about a cube'],
};

function joined(parts: BrittneySystemPromptParts): string {
  return parts.fixedInstructions + parts.dynamicContext;
}

describe('Brittney fixed-instructions cache split', () => {
  it('concatenation matches buildContextualPrompt for a full turn', () => {
    const scene = 'composition "A" { object "Cube" {} }';
    const profile = { name: 'Ada', tier: 'pro', preferredTargets: ['web'] };
    const github = {
      username: 'ada',
      repos: [] as Array<{
        fullName: string;
        description: string | null;
        language: string | null;
        isPrivate: boolean;
      }>,
    };
    const caching = { providerName: 'anthropic', model: 'claude-opus-4-7', sceneContext: scene };
    const full = buildContextualPrompt(scene, profile, true, caching, github, true, [THREAD]);
    const parts = buildContextualPromptParts(scene, profile, true, caching, github, true, [THREAD]);
    expect(joined(parts)).toBe(full);
    expect(parts.fixedInstructions.length + parts.dynamicContext.length).toBe(full.length);
  });

  it('scene changes do not change the fixed-instruction cache key', () => {
    const a = buildContextualPromptParts('scene-one', null, false);
    const b = buildContextualPromptParts('scene-two', null, false);
    expect(a.fixedInstructions).toBe(b.fixedInstructions);
    expect(a.fixedInstructions).not.toContain('scene-one');
    expect(a.fixedInstructions).not.toContain('scene-two');
    expect(a.dynamicContext).toContain('scene-one');
    expect(b.dynamicContext).toContain('scene-two');
    expect(a.dynamicContext).not.toBe(b.dynamicContext);
  });

  it('founder mode is a distinct fixed-instruction set', () => {
    const user = buildContextualPromptParts(null, null, false, {}, null, false);
    const founder = buildContextualPromptParts(null, null, false, {}, null, true);
    expect(founder.fixedInstructions).not.toBe(user.fixedInstructions);
    expect(founder.fixedInstructions.startsWith(user.fixedInstructions)).toBe(true);
    expect(founder.fixedInstructions).toContain('Founder Mode');
    expect(user.fixedInstructions).not.toContain('Founder Mode');
  });

  it('simulation guidance on and off are distinct fixed-instruction sets', () => {
    const off = buildContextualPromptParts(null, null, false);
    const on = buildContextualPromptParts(null, null, true);
    expect(on.fixedInstructions).not.toBe(off.fixedInstructions);
    expect(on.fixedInstructions).toContain('Simulation Capabilities');
    expect(off.fixedInstructions).not.toContain('Simulation Capabilities');
  });

  it('profile, GitHub, past threads, and the caching declaration stay in the suffix', () => {
    const parts = buildContextualPromptParts(
      'composition "Room" {}',
      { name: 'Ada', tier: 'pro' },
      false,
      { providerName: 'anthropic', model: 'claude-opus-4-7' },
      { username: 'ada' },
      false,
      [THREAD]
    );
    expect(parts.fixedInstructions).not.toContain('Ada');
    expect(parts.fixedInstructions).not.toContain('@ada');
    expect(parts.fixedInstructions).not.toContain('Earlier thread');
    expect(parts.fixedInstructions).not.toContain('Brittney Brain Caching');
    expect(parts.fixedInstructions).not.toContain('Current Scene');
    expect(parts.dynamicContext).toContain('Name: Ada');
    expect(parts.dynamicContext).toContain('@ada');
    expect(parts.dynamicContext).toContain('Earlier thread');
    expect(parts.dynamicContext).toContain('Brittney Brain Caching');
    expect(parts.dynamicContext).toContain('composition "Room" {}');
  });

  it('live workspace and scene details stay out of the fixed-instruction block', () => {
    // Paying-customer path: BrittneyChatPanel builds one assistant context
    // (workspace, git, board, scene) and the route appends that string to the
    // system prompt. Two different live snapshots must share one fixed block.
    const first = buildWorkspaceAssistantContext({
      sceneContext: 'Currently selected object: "Cube"',
      historyScope: 'workspace:ws_demo',
      workspace: {
        id: 'ws_demo',
        name: 'demo-app',
        repoUrl: 'https://github.com/octocat/demo-app.git',
        branch: 'main',
        status: 'ready',
      },
      git: { branch: 'main', clean: false, files: [{ path: 'src/app/page.tsx', status: 'M' }] },
    });
    const second = buildWorkspaceAssistantContext({
      sceneContext: 'Currently selected object: "Sphere"',
      historyScope: 'workspace:ws_demo',
      workspace: {
        id: 'ws_demo',
        name: 'demo-app',
        repoUrl: 'https://github.com/octocat/demo-app.git',
        branch: 'feature',
        status: 'ready',
      },
      git: { branch: 'feature', clean: true, files: [] },
    });

    const a = buildContextualPromptParts(first, null, true, { providerName: 'anthropic' });
    const b = buildContextualPromptParts(second, null, true, { providerName: 'anthropic' });

    expect(a.fixedInstructions).toBe(b.fixedInstructions);
    expect(a.fixedInstructions).not.toContain('demo-app');
    expect(a.fixedInstructions).not.toContain('page.tsx');
    expect(a.fixedInstructions).not.toContain('Currently selected object');
    expect(a.dynamicContext).toContain('demo-app');
    expect(a.dynamicContext).toContain('page.tsx');
    expect(a.dynamicContext).toContain('Cube');
    expect(b.dynamicContext).toContain('Sphere');
    expect(b.dynamicContext).toContain('feature');
    expect(a.dynamicContext).not.toBe(b.dynamicContext);
  });
});
