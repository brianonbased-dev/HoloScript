import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityMatcher } from '../CapabilityMatcher';
import { AgentManifestBuilder } from '../AgentManifest';
import type { AgentManifest, AgentCapability } from '../AgentManifest';
import type { CapabilityQuery } from '../CapabilityMatcher';

function makeManifest(
  id: string,
  capabilities: AgentCapability[],
  trust: 'local' | 'verified' | 'known' | 'external' | 'untrusted' = 'local'
): AgentManifest {
  const builder = new AgentManifestBuilder()
    .identity(id, `Agent ${id}`, '1.0.0')
    .addEndpoint({ protocol: 'local', address: 'in-process' })
    .trust(trust);
  for (const cap of capabilities) builder.addCapability(cap);
  return builder.build();
}

describe('CapabilityMatcher', () => {
  let matcher: CapabilityMatcher;

  beforeEach(() => { matcher = new CapabilityMatcher(); });

  // ---------------------------------------------------------------------------
  // matchCapability
  // ---------------------------------------------------------------------------

  it('matchCapability returns match for matching type', () => {
    const cap: AgentCapability = { type: 'analyze', domain: 'general' };
    const query: CapabilityQuery = { type: 'analyze' };
    const result = matcher.matchCapability(cap, query);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('matchCapability returns null for non-matching type', () => {
    const cap: AgentCapability = { type: 'render', domain: 'vision' };
    const query: CapabilityQuery = { type: 'analyze' };
    const result = matcher.matchCapability(cap, query);
    expect(result).toBeNull();
  });

  it('matchCapability matches domain', () => {
    const cap: AgentCapability = { type: 'analyze', domain: 'vision' };
    const query: CapabilityQuery = { domain: 'vision' };
    const result = matcher.matchCapability(cap, query);
    expect(result).not.toBeNull();
  });

  it('matchCapability filters by latency', () => {
    const cap: AgentCapability = { type: 'analyze', domain: 'general', latency: 'slow' };
    const query: CapabilityQuery = { maxLatency: 'fast' };
    const result = matcher.matchCapability(cap, query);
    expect(result).toBeNull();
  });

  it('matchCapability accepts acceptable latency', () => {
    const cap: AgentCapability = { type: 'analyze', domain: 'general', latency: 'fast' };
    const query: CapabilityQuery = { maxLatency: 'medium' };
    const result = matcher.matchCapability(cap, query);
    expect(result).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // matchAgent
  // ---------------------------------------------------------------------------

  it('matchAgent matches agent with relevant capability', () => {
    const manifest = makeManifest('a', [{ type: 'analyze', domain: 'general' }]);
    const query: CapabilityQuery = { type: 'analyze' };
    const result = matcher.matchAgent(manifest, query);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it('matchAgent returns null for non-matching agent', () => {
    const manifest = makeManifest('a', [{ type: 'render', domain: 'vision' }]);
    const query: CapabilityQuery = { type: 'analyze' };
    const result = matcher.matchAgent(manifest, query);
    expect(result).toBeNull();
  });

  it('matchAgent filters by trust level', () => {
    const manifest = makeManifest('a', [{ type: 'analyze', domain: 'general' }], 'external');
    const query: CapabilityQuery = { type: 'analyze', minTrust: 'verified' };
    const result = matcher.matchAgent(manifest, query);
    expect(result).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // findMatches
  // ---------------------------------------------------------------------------

  it('findMatches returns all matching agents', () => {
    const manifests = [
      makeManifest('a', [{ type: 'analyze', domain: 'general' }]),
      makeManifest('b', [{ type: 'render', domain: 'vision' }]),
      makeManifest('c', [{ type: 'analyze', domain: 'nlp' }]),
    ];
    const results = matcher.findMatches(manifests, { type: 'analyze' });
    expect(results.length).toBe(2);
  });

  it('findMatches respects limit', () => {
    const manifests = [
      makeManifest('a', [{ type: 'analyze', domain: 'general' }]),
      makeManifest('b', [{ type: 'analyze', domain: 'nlp' }]),
      makeManifest('c', [{ type: 'analyze', domain: 'vision' }]),
    ];
    const results = matcher.findMatches(manifests, { type: 'analyze', limit: 2 });
    expect(results.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // findBest
  // ---------------------------------------------------------------------------

  it('findBest returns best matching agent', () => {
    const manifests = [
      makeManifest('a', [{ type: 'analyze', domain: 'general' }]),
      makeManifest('b', [{ type: 'analyze', domain: 'general', priority: 10 }]),
    ];
    const best = matcher.findBest(manifests, { type: 'analyze' });
    expect(best).not.toBeNull();
  });

  it('findBest returns null for empty matches', () => {
    const best = matcher.findBest([], { type: 'analyze' });
    expect(best).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  it('sortMatches sorts by score descending', () => {
    const manifests = [
      makeManifest('a', [{ type: 'analyze', domain: 'general', priority: 1 }]),
      makeManifest('b', [{ type: 'analyze', domain: 'general', priority: 10 }]),
    ];
    const matches = matcher.findMatches(manifests, { type: 'analyze' });
    matcher.sortMatches(matches, 'score', 'desc');
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
  });

  it('sortMatches sorts by name ascending', () => {
    const manifests = [
      makeManifest('z-agent', [{ type: 'analyze', domain: 'general' }]),
      makeManifest('a-agent', [{ type: 'analyze', domain: 'general' }]),
    ];
    const matches = matcher.findMatches(manifests, { type: 'analyze' });
    matcher.sortMatches(matches, 'name', 'asc');
    expect(matches[0].manifest.id).toBe('a-agent');
  });

  // ---------------------------------------------------------------------------
  // Multi-type / Multi-domain Queries
  // ---------------------------------------------------------------------------

  it('matches with array of types', () => {
    const manifests = [
      makeManifest('a', [{ type: 'analyze', domain: 'general' }]),
      makeManifest('b', [{ type: 'render', domain: 'vision' }]),
    ];
    const results = matcher.findMatches(manifests, { type: ['analyze', 'render'] });
    expect(results.length).toBe(2);
  });
});
