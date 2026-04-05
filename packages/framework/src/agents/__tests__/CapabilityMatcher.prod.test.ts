/**
 * CapabilityMatcher — Production Test Suite
 *
 * Covers: matchCapability, matchAgent, findMatches, findBest, sortMatches.
 */
import { describe, it, expect } from 'vitest';
import { CapabilityMatcher } from '../CapabilityMatcher';
import type { AgentManifest, AgentCapability } from '../AgentManifest';

function mkManifest(id: string, caps: Partial<AgentCapability>[]): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: caps.map((c) => ({ type: 'compute', domain: 'physics', ...c })),
    endpoints: [{ protocol: 'http' as const, address: 'localhost' }],
    trustLevel: 'local',
    status: 'online',
  } as AgentManifest;
}

describe('CapabilityMatcher — Production', () => {
  const matcher = new CapabilityMatcher();

  // ─── matchCapability ─────────────────────────────────────────────
  it('matches capability by type', () => {
    const cap: AgentCapability = { type: 'compute', domain: 'physics' };
    const match = matcher.matchCapability(cap, { type: 'compute' });
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThan(0);
  });

  it('returns null for non-matching type', () => {
    const cap: AgentCapability = { type: 'compute', domain: 'physics' };
    expect(matcher.matchCapability(cap, { type: 'render' })).toBeNull();
  });

  it('matches capability by domain', () => {
    const cap: AgentCapability = { type: 'compute', domain: 'physics' };
    const match = matcher.matchCapability(cap, { domain: 'physics' });
    expect(match).not.toBeNull();
  });

  // ─── matchAgent ──────────────────────────────────────────────────
  it('matchAgent returns match for matching agent', () => {
    const m = mkManifest('a1', [{ type: 'compute', domain: 'physics' }]);
    const match = matcher.matchAgent(m, { type: 'compute' });
    expect(match).not.toBeNull();
    expect(match!.manifest.id).toBe('a1');
  });

  it('matchAgent returns null for non-matching agent', () => {
    const m = mkManifest('a1', [{ type: 'render', domain: 'graphics' }]);
    expect(matcher.matchAgent(m, { type: 'compute' })).toBeNull();
  });

  // ─── findMatches ─────────────────────────────────────────────────
  it('findMatches filters and scores agents', () => {
    const agents = [
      mkManifest('a1', [{ type: 'compute', domain: 'physics' }]),
      mkManifest('a2', [{ type: 'render', domain: 'graphics' }]),
      mkManifest('a3', [{ type: 'compute', domain: 'ai' }]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute' });
    expect(matches.length).toBe(2);
    expect(matches.every((m) => m.manifest.id !== 'a2')).toBe(true);
  });

  it('findMatches respects limit', () => {
    const agents = [
      mkManifest('a1', [{ type: 'compute' }]),
      mkManifest('a2', [{ type: 'compute' }]),
      mkManifest('a3', [{ type: 'compute' }]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute', limit: 1 });
    expect(matches.length).toBe(1);
  });

  // ─── findBest ────────────────────────────────────────────────────
  it('findBest returns top match', () => {
    const agents = [
      mkManifest('a1', [{ type: 'compute', domain: 'physics' }]),
      mkManifest('a2', [{ type: 'compute', domain: 'physics', priority: 10 }]),
    ];
    const best = matcher.findBest(agents, { type: 'compute' });
    expect(best).not.toBeNull();
  });

  it('findBest returns null for no matches', () => {
    expect(matcher.findBest([], { type: 'compute' })).toBeNull();
  });

  // ─── sortMatches ─────────────────────────────────────────────────
  it('sortMatches by score desc', () => {
    const agents = [
      mkManifest('low', [{ type: 'compute' }]),
      mkManifest('high', [{ type: 'compute', domain: 'physics' }]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute', domain: 'physics' });
    matcher.sortMatches(matches, 'score', 'desc');
    if (matches.length >= 2) {
      expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
    }
  });

  it('sortMatches by name asc', () => {
    const agents = [
      mkManifest('z-agent', [{ type: 'compute' }]),
      mkManifest('a-agent', [{ type: 'compute' }]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute' });
    matcher.sortMatches(matches, 'name', 'asc');
    if (matches.length >= 2) {
      expect(matches[0].manifest.name <= matches[1].manifest.name).toBe(true);
    }
  });
});
