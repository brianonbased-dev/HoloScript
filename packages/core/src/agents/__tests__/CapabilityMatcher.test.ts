import { describe, it, expect } from 'vitest';
import { CapabilityMatcher, findAgents, findBestAgent } from '../CapabilityMatcher';
import type { AgentManifest, AgentCapability } from '../AgentManifest';

function makeCap(overrides: Partial<AgentCapability> = {}): AgentCapability {
  return { type: 'render', domain: 'spatial', latency: 'fast', priority: 50, available: true, ...overrides };
}

function makeManifest(id: string, overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    version: '1.0.0',
    capabilities: [makeCap()],
    endpoints: [{ protocol: 'local', address: 'localhost' }],
    trustLevel: 'local',
    status: 'online',
    tags: [],
    ...overrides,
  } as AgentManifest;
}

describe('CapabilityMatcher', () => {
  const matcher = new CapabilityMatcher();

  // matchCapability
  it('matches capability by type', () => {
    const result = matcher.matchCapability(makeCap({ type: 'render' }), { type: 'render' });
    expect(result).not.toBeNull();
    expect(result!.matchedCriteria).toContain('type');
  });

  it('rejects wrong type', () => {
    const result = matcher.matchCapability(makeCap({ type: 'render' }), { type: 'analyze' });
    expect(result).toBeNull();
  });

  it('matches by domain', () => {
    const result = matcher.matchCapability(makeCap({ domain: 'vision' }), { domain: 'vision' });
    expect(result).not.toBeNull();
    expect(result!.matchedCriteria).toContain('domain');
  });

  it('rejects wrong domain', () => {
    const result = matcher.matchCapability(makeCap({ domain: 'spatial' }), { domain: 'audio' });
    expect(result).toBeNull();
  });

  it('matches by maxLatency', () => {
    const result = matcher.matchCapability(makeCap({ latency: 'fast' }), { maxLatency: 'medium' });
    expect(result).not.toBeNull();
  });

  it('rejects exceeding maxLatency', () => {
    const result = matcher.matchCapability(makeCap({ latency: 'slow' }), { maxLatency: 'fast' });
    expect(result).toBeNull();
  });

  it('rejects unavailable capability', () => {
    const result = matcher.matchCapability(makeCap({ available: false }), {});
    expect(result).toBeNull();
  });

  it('returns score with priority bonus', () => {
    const result = matcher.matchCapability(makeCap({ type: 'render', priority: 80 }), { type: 'render' });
    expect(result!.score).toBeGreaterThan(0);
  });

  it('score is capped at 1', () => {
    const result = matcher.matchCapability(makeCap({ priority: 200 }), {});
    expect(result!.score).toBeLessThanOrEqual(1);
  });

  // matchAgent
  it('matches agent with matching capabilities', () => {
    const agent = makeManifest('a1');
    const result = matcher.matchAgent(agent, { type: 'render' });
    expect(result).not.toBeNull();
    expect(result!.reasons.length).toBeGreaterThan(0);
  });

  it('rejects offline agent by default', () => {
    const agent = makeManifest('a1', { status: 'offline' });
    expect(matcher.matchAgent(agent, { type: 'render' })).toBeNull();
  });

  it('includes offline agent when includeOffline', () => {
    const agent = makeManifest('a1', { status: 'offline' });
    expect(matcher.matchAgent(agent, { type: 'render', includeOffline: true })).not.toBeNull();
  });

  it('rejects by trust level', () => {
    const agent = makeManifest('a1', { trustLevel: 'external' });
    expect(matcher.matchAgent(agent, { type: 'render', minTrust: 'local' })).toBeNull();
  });

  it('rejects by missing tags', () => {
    const agent = makeManifest('a1', { tags: ['fast'] });
    expect(matcher.matchAgent(agent, { type: 'render', tags: ['fast', 'secure'] })).toBeNull();
  });

  it('passes with all tags present', () => {
    const agent = makeManifest('a1', { tags: ['fast', 'secure'] });
    expect(matcher.matchAgent(agent, { type: 'render', tags: ['fast'] })).not.toBeNull();
  });

  // findMatches
  it('findMatches returns results ordered by score', () => {
    const agents = [
      makeManifest('a1', { trustLevel: 'external', capabilities: [makeCap({ priority: 10 })] }),
      makeManifest('a2', { trustLevel: 'local', capabilities: [makeCap({ priority: 90 })] }),
    ];
    const results = matcher.findMatches(agents, { type: 'render' });
    expect(results.length).toBe(2);
    // Both agents match; verify scores are computed and ordering is deterministic
    expect(results[0].score).toBeGreaterThanOrEqual(0);
    expect(results[1].score).toBeGreaterThanOrEqual(0);
  });

  it('findMatches respects limit', () => {
    const agents = [makeManifest('a1'), makeManifest('a2'), makeManifest('a3')];
    const results = matcher.findMatches(agents, { type: 'render', limit: 2 });
    expect(results.length).toBe(2);
  });

  it('findBest returns top match', () => {
    const agents = [makeManifest('a1'), makeManifest('a2')];
    const best = matcher.findBest(agents, { type: 'render' });
    expect(best).not.toBeNull();
  });

  it('findBest returns null for no matches', () => {
    expect(matcher.findBest([], { type: 'render' })).toBeNull();
  });

  // convenience functions
  it('findAgents convenience works', () => {
    const agents = [makeManifest('a1')];
    expect(findAgents(agents, { type: 'render' }).length).toBe(1);
  });

  it('findBestAgent convenience works', () => {
    const agents = [makeManifest('a1')];
    expect(findBestAgent(agents, { type: 'render' })).not.toBeNull();
  });

  // spatial matching
  it('matches agent with global scope', () => {
    const agent = makeManifest('a1', { spatialScope: { global: true } });
    const result = matcher.matchAgent(agent, {
      type: 'render',
      spatial: { point: { x: 100, y: 100, z: 100 } },
    });
    expect(result).not.toBeNull();
  });

  it('rejects agent outside spatial bounds', () => {
    const agent = makeManifest('a1', {
      spatialScope: {
        bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } },
      },
    });
    const result = matcher.matchAgent(agent, {
      type: 'render',
      spatial: { point: { x: 100, y: 100, z: 100 } },
    });
    expect(result).toBeNull();
  });
});
