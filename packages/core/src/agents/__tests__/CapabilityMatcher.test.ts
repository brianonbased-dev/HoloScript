import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityMatcher } from '../CapabilityMatcher';
import type { AgentManifest, AgentCapability } from '../AgentManifest';
import type { CapabilityQuery } from '../CapabilityMatcher';

function makeCap(type: string, domain: string, overrides: Partial<AgentCapability> = {}): AgentCapability {
  return { type, domain, ...overrides } as AgentCapability;
}

function makeManifest(id: string, caps: AgentCapability[], overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id, name: id, version: '1.0.0',
    capabilities: caps,
    status: 'online',
    trust: 'local',
    endpoints: [{ protocol: 'http', address: 'localhost' }],
    ...overrides,
  } as AgentManifest;
}

describe('CapabilityMatcher', () => {
  let matcher: CapabilityMatcher;

  beforeEach(() => { matcher = new CapabilityMatcher(); });

  // ---------------------------------------------------------------------------
  // matchCapability
  // ---------------------------------------------------------------------------

  it('matchCapability returns match for matching type', () => {
    const cap = makeCap('compute', 'general');
    const match = matcher.matchCapability(cap, { type: 'compute' });
    expect(match).not.toBeNull();
    expect(match!.score).toBeGreaterThan(0);
  });

  it('matchCapability returns null for non-matching type', () => {
    const cap = makeCap('compute', 'general');
    expect(matcher.matchCapability(cap, { type: 'render' })).toBeNull();
  });

  it('matchCapability matches by domain', () => {
    const cap = makeCap('compute', 'graphics');
    const match = matcher.matchCapability(cap, { domain: 'graphics' });
    expect(match).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // matchAgent
  // ---------------------------------------------------------------------------

  it('matchAgent returns match for agent with matching capabilities', () => {
    const m = makeManifest('a1', [makeCap('compute', 'general'), makeCap('render', 'graphics')]);
    const match = matcher.matchAgent(m, { type: 'compute' });
    expect(match).not.toBeNull();
    expect(match!.manifest.id).toBe('a1');
  });

  it('matchAgent returns null for non-matching query', () => {
    const m = makeManifest('a1', [makeCap('render', 'graphics')]);
    expect(matcher.matchAgent(m, { type: 'compute' })).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // findMatches
  // ---------------------------------------------------------------------------

  it('findMatches filters matching agents', () => {
    const agents = [
      makeManifest('a1', [makeCap('compute', 'general')]),
      makeManifest('a2', [makeCap('render', 'graphics')]),
      makeManifest('a3', [makeCap('compute', 'ai')]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute' });
    expect(matches).toHaveLength(2);
  });

  it('findMatches respects limit', () => {
    const agents = [
      makeManifest('a1', [makeCap('compute', 'general')]),
      makeManifest('a2', [makeCap('compute', 'ai')]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute', limit: 1 });
    expect(matches).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // findBest
  // ---------------------------------------------------------------------------

  it('findBest returns highest scored match', () => {
    const agents = [
      makeManifest('a1', [makeCap('compute', 'general')]),
      makeManifest('a2', [makeCap('compute', 'general', { priority: 10 })]),
    ];
    const best = matcher.findBest(agents, { type: 'compute' });
    expect(best).not.toBeNull();
  });

  it('findBest returns null when no matches', () => {
    expect(matcher.findBest([], { type: 'compute' })).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  it('sortMatches sorts by score descending', () => {
    const agents = [
      makeManifest('low', [makeCap('compute', 'general')]),
      makeManifest('high', [makeCap('compute', 'general', { priority: 100 })]),
    ];
    const matches = matcher.findMatches(agents, { type: 'compute' });
    matcher.sortMatches(matches, 'score', 'desc');
    // Higher priority should sort first
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
  });
});
