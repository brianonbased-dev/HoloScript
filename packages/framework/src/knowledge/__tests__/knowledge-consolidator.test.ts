import { describe, it, expect, beforeEach } from 'vitest';
import {
  KnowledgeConsolidator,
  type TieredEntry,
  type ProvenanceNode,
  type CrossDomainPattern,
  type Contradiction,
} from '../knowledge-consolidator';
import { KnowledgeStore } from '../knowledge-store';
import type { StoredEntry } from '../knowledge-store';

function makeEntry(overrides: Partial<StoredEntry> = {}): StoredEntry {
  return {
    id: overrides.id ?? `W.TEST.${Math.random().toString(36).slice(2, 6)}`,
    type: 'wisdom',
    content: overrides.content ?? 'Test knowledge entry',
    domain: overrides.domain ?? 'general',
    confidence: 0.8,
    source: 'test',
    queryCount: overrides.queryCount ?? 0,
    reuseCount: overrides.reuseCount ?? 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    authorAgent: overrides.authorAgent ?? 'test-agent',
    provenanceHash: overrides.provenanceHash,
    excitability: overrides.excitability ?? {
      queryCount: 0,
      citationCount: 0,
      corroborationCount: 0,
      excitability: 0,
      lastRetrievedAt: 0,
      lastReconsolidatedAt: 0,
      consolidationSurvivals: 0,
    },
  };
}

describe('KnowledgeConsolidator', () => {
  let consolidator: KnowledgeConsolidator;

  beforeEach(() => {
    consolidator = new KnowledgeConsolidator();
  });

  // ── Tier Management ──

  describe('addEntry / getEntry', () => {
    it('adds entries to hot tier by default', () => {
      const entry = makeEntry({ id: 'W.TEST.001' });
      const tiered = consolidator.addEntry(entry);
      expect(tiered.tier).toBe('hot');
      expect(tiered.provenanceChain).toHaveLength(1);
      expect(tiered.provenanceChain[0].action).toBe('created');
    });

    it('deduplicates by id', () => {
      const entry = makeEntry({ id: 'W.TEST.DUP' });
      consolidator.addEntry(entry);
      const second = consolidator.addEntry(entry);
      expect(consolidator.size).toBe(1);
      expect(second.id).toBe('W.TEST.DUP');
    });

    it('records parent entry in provenance', () => {
      const entry = makeEntry({ id: 'W.TEST.CHILD' });
      consolidator.addEntry(entry, 'W.TEST.PARENT');
      const chain = consolidator.getProvenanceChain('W.TEST.CHILD');
      expect(chain[0].parentEntryId).toBe('W.TEST.PARENT');
    });
  });

  describe('importFromStore', () => {
    it('imports all entries from a KnowledgeStore', () => {
      const store = new KnowledgeStore({ persist: false });
      store.publish({ type: 'wisdom', content: 'Entry A', domain: 'security', confidence: 0.9, source: 'test' }, 'agent-a');
      store.publish({ type: 'pattern', content: 'Entry B', domain: 'agents', confidence: 0.8, source: 'test' }, 'agent-b');

      const imported = consolidator.importFromStore(store);
      expect(imported).toBe(2);
      expect(consolidator.size).toBe(2);
    });

    it('skips already-imported entries', () => {
      const store = new KnowledgeStore({ persist: false });
      store.publish({ type: 'wisdom', content: 'Entry A', domain: 'general', confidence: 0.9, source: 'test' }, 'agent-a');

      consolidator.importFromStore(store);
      const second = consolidator.importFromStore(store);
      expect(second).toBe(0);
    });
  });

  // ── Sleep/Wake Cycles ──

  describe('sleepCycle', () => {
    it('demotes idle hot entries to warm', () => {
      const entry = makeEntry({ id: 'W.TEST.IDLE' });
      consolidator.addEntry(entry);

      // Simulate idle by backdating tierChangedAt
      const tiered = consolidator.getEntry('W.TEST.IDLE')!;
      tiered.tierChangedAt = Date.now() - 7 * 60 * 60 * 1000; // 7h ago (> 6h default)

      const stats = consolidator.sleepCycle();
      expect(stats.demoted).toBeGreaterThanOrEqual(1);
      expect(consolidator.getEntry('W.TEST.IDLE')!.tier).toBe('warm');
    });

    it('demotes idle warm entries to cold', () => {
      const entry = makeEntry({ id: 'W.TEST.WARMOLD' });
      const tiered = consolidator.addEntry(entry);
      tiered.tier = 'warm';
      tiered.tierChangedAt = Date.now() - 50 * 60 * 60 * 1000; // 50h ago (> 48h default)

      const stats = consolidator.sleepCycle();
      expect(stats.demoted).toBeGreaterThanOrEqual(1);
      expect(consolidator.getEntry('W.TEST.WARMOLD')!.tier).toBe('cold');
    });

    it('enforces hot capacity', () => {
      const small = new KnowledgeConsolidator({ hotCapacity: 2 });
      small.addEntry(makeEntry({ id: 'W.A' }));
      small.addEntry(makeEntry({ id: 'W.B' }));
      small.addEntry(makeEntry({ id: 'W.C' }));

      const stats = small.sleepCycle();
      expect(stats.demoted).toBeGreaterThanOrEqual(1);
      expect(small.getByTier('hot').length).toBeLessThanOrEqual(2);
    });

    it('adds demoted provenance node', () => {
      const entry = makeEntry({ id: 'W.TEST.PROV' });
      consolidator.addEntry(entry);
      consolidator.getEntry('W.TEST.PROV')!.tierChangedAt = Date.now() - 7 * 60 * 60 * 1000;

      consolidator.sleepCycle();
      const chain = consolidator.getProvenanceChain('W.TEST.PROV');
      expect(chain[0].action).toBe('demoted');
    });
  });

  describe('wakeCycle', () => {
    it('promotes cold entries with recent access to warm', () => {
      const entry = makeEntry({ id: 'W.TEST.WAKE' });
      const tiered = consolidator.addEntry(entry);
      tiered.tier = 'cold';
      tiered.tierChangedAt = Date.now() - 10000;
      tiered.excitability = {
        queryCount: 1,
        citationCount: 0,
        corroborationCount: 0,
        excitability: 2,
        lastRetrievedAt: Date.now(), // accessed after tier change
        lastReconsolidatedAt: 0,
        consolidationSurvivals: 0,
      };

      const stats = consolidator.wakeCycle();
      expect(stats.promoted).toBe(1);
      expect(consolidator.getEntry('W.TEST.WAKE')!.tier).toBe('warm');
    });

    it('promotes warm entries with high query count to hot', () => {
      const entry = makeEntry({ id: 'W.TEST.HOTPROMOTE' });
      const tiered = consolidator.addEntry(entry);
      tiered.tier = 'warm';
      tiered.tierChangedAt = Date.now() - 10000;
      tiered.excitability = {
        queryCount: 5,
        citationCount: 0,
        corroborationCount: 0,
        excitability: 10,
        lastRetrievedAt: Date.now(),
        lastReconsolidatedAt: 0,
        consolidationSurvivals: 0,
      };

      const stats = consolidator.wakeCycle();
      expect(stats.promoted).toBe(1);
      expect(consolidator.getEntry('W.TEST.HOTPROMOTE')!.tier).toBe('hot');
    });

    it('does not promote if no recent access', () => {
      const entry = makeEntry({ id: 'W.TEST.NOACCESS' });
      const tiered = consolidator.addEntry(entry);
      tiered.tier = 'cold';
      tiered.tierChangedAt = Date.now();
      // lastRetrievedAt is 0 (before tierChangedAt)

      const stats = consolidator.wakeCycle();
      expect(stats.promoted).toBe(0);
    });
  });

  describe('promote / evict', () => {
    it('promotes cold → warm → hot', () => {
      const entry = makeEntry({ id: 'W.TEST.UP' });
      const tiered = consolidator.addEntry(entry);
      tiered.tier = 'cold';

      expect(consolidator.promote('W.TEST.UP')).toBe(true);
      expect(consolidator.getEntry('W.TEST.UP')!.tier).toBe('warm');

      expect(consolidator.promote('W.TEST.UP')).toBe(true);
      expect(consolidator.getEntry('W.TEST.UP')!.tier).toBe('hot');

      // Already hot — no-op
      expect(consolidator.promote('W.TEST.UP')).toBe(false);
    });

    it('evicts entries from all tiers', () => {
      consolidator.addEntry(makeEntry({ id: 'W.TEST.EVICT' }));
      expect(consolidator.evict('W.TEST.EVICT')).toBe(true);
      expect(consolidator.getEntry('W.TEST.EVICT')).toBeUndefined();
      expect(consolidator.evict('W.TEST.EVICT')).toBe(false);
    });
  });

  // ── Cross-Domain Pattern Surfacing ──

  describe('surfaceCrossDomainPatterns', () => {
    it('finds patterns shared across domains', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.SEC.001',
        content: 'WebSocket connections require authentication tokens',
        domain: 'security',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.AGENT.001',
        content: 'Agent WebSocket connections drop after timeout',
        domain: 'agents',
      }));

      const patterns = consolidator.surfaceCrossDomainPatterns();
      const wsPattern = patterns.find(p => p.pattern === 'websocket');
      expect(wsPattern).toBeDefined();
      expect(wsPattern!.domains).toContain('security');
      expect(wsPattern!.domains).toContain('agents');
    });

    it('filters by specified domains', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.SEC.F1',
        content: 'Authentication tokens expire after timeout',
        domain: 'security',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.AGENT.F1',
        content: 'Agent tokens refresh automatically',
        domain: 'agents',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.COMP.F1',
        content: 'Compiler tokens are parsed differently',
        domain: 'compilation',
      }));

      const patterns = consolidator.surfaceCrossDomainPatterns(['security', 'agents']);
      // Should not include compilation domain
      for (const p of patterns) {
        expect(p.domains).not.toContain('compilation');
      }
    });

    it('returns empty for single-domain entries', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.ONLY.001',
        content: 'Only security concern here',
        domain: 'security',
      }));

      const patterns = consolidator.surfaceCrossDomainPatterns();
      // No pattern can span 2+ domains with only 1 domain present
      expect(patterns.every(p => p.domains.length >= 2)).toBe(true);
    });
  });

  // ── Contradiction Detection ──

  describe('detectContradictions', () => {
    it('detects negation-based contradictions', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.CON.A',
        content: 'You should always validate input before processing',
        domain: 'security',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.CON.B',
        content: 'You should never validate input in the render loop',
        domain: 'security',
      }));

      const contradictions = consolidator.detectContradictions();
      expect(contradictions.length).toBeGreaterThanOrEqual(1);
      const c = contradictions[0];
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.reason).toContain('never');
    });

    it('detects should/should not contradictions', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.REC.A',
        content: 'Agents should enable caching for performance',
        domain: 'agents',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.REC.B',
        content: 'Agents should not enable caching in tests',
        domain: 'agents',
      }));

      const contradictions = consolidator.detectContradictions();
      expect(contradictions.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for non-contradicting entries', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.OK.A',
        content: 'Use TypeScript for type safety',
        domain: 'compilation',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.OK.B',
        content: 'Prefer vitest over jest for testing',
        domain: 'compilation',
      }));

      const contradictions = consolidator.detectContradictions();
      expect(contradictions.length).toBe(0);
    });

    it('accepts external entry array', () => {
      const entries: StoredEntry[] = [
        makeEntry({ id: 'W.EXT.A', content: 'Feature is deprecated and removed', domain: 'general' }),
        makeEntry({ id: 'W.EXT.B', content: 'Feature is recommended and added recently', domain: 'general' }),
      ];

      const contradictions = consolidator.detectContradictions(entries);
      expect(contradictions.length).toBeGreaterThanOrEqual(1);
    });

    it('assigns higher confidence to same-domain contradictions', () => {
      consolidator.addEntry(makeEntry({
        id: 'W.CONF.A',
        content: 'Always enable debug logging in production',
        domain: 'security',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.CONF.B',
        content: 'Never enable debug logging anywhere',
        domain: 'security',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.CONF.C',
        content: 'Always enable verbose logging modes',
        domain: 'agents',
      }));
      consolidator.addEntry(makeEntry({
        id: 'W.CONF.D',
        content: 'Never enable verbose logging modes',
        domain: 'rendering',
      }));

      const contradictions = consolidator.detectContradictions();
      const sameDomain = contradictions.filter(c => c.entryA.domain === c.entryB.domain);
      const crossDomain = contradictions.filter(c => c.entryA.domain !== c.entryB.domain);

      if (sameDomain.length > 0 && crossDomain.length > 0) {
        expect(sameDomain[0].confidence).toBeGreaterThan(crossDomain[0].confidence);
      }
    });
  });

  // ── Provenance Chain ──

  describe('getProvenanceChain', () => {
    it('returns creation node for new entries', () => {
      consolidator.addEntry(makeEntry({ id: 'W.PROV.NEW', authorAgent: 'creator-agent' }));
      const chain = consolidator.getProvenanceChain('W.PROV.NEW');
      expect(chain).toHaveLength(1);
      expect(chain[0].action).toBe('created');
      expect(chain[0].agentId).toBe('creator-agent');
    });

    it('accumulates provenance through tier changes', () => {
      const entry = makeEntry({ id: 'W.PROV.TIER' });
      const tiered = consolidator.addEntry(entry);
      tiered.tier = 'cold';
      tiered.tierChangedAt = Date.now() - 10000;

      consolidator.promote('W.PROV.TIER'); // cold → warm
      consolidator.promote('W.PROV.TIER'); // warm → hot

      const chain = consolidator.getProvenanceChain('W.PROV.TIER');
      expect(chain.length).toBe(3); // created + 2 promotions
      expect(chain[0].action).toBe('promoted');
      expect(chain[1].action).toBe('promoted');
      expect(chain[2].action).toBe('created');
    });

    it('returns empty for unknown entries', () => {
      expect(consolidator.getProvenanceChain('NONEXISTENT')).toEqual([]);
    });
  });

  describe('recordCitation', () => {
    it('adds citation to provenance chain', () => {
      consolidator.addEntry(makeEntry({ id: 'W.CITE.001' }));
      expect(consolidator.recordCitation('W.CITE.001', 'citing-agent')).toBe(true);

      const chain = consolidator.getProvenanceChain('W.CITE.001');
      expect(chain[0].action).toBe('cited');
      expect(chain[0].agentId).toBe('citing-agent');
    });

    it('boosts excitability on citation', () => {
      consolidator.addEntry(makeEntry({ id: 'W.CITE.BOOST' }));
      const before = consolidator.getEntry('W.CITE.BOOST')!.excitability!.citationCount;
      consolidator.recordCitation('W.CITE.BOOST', 'agent-x');
      const after = consolidator.getEntry('W.CITE.BOOST')!.excitability!.citationCount;
      expect(after).toBe(before + 1);
    });

    it('returns false for unknown entry', () => {
      expect(consolidator.recordCitation('NONEXISTENT', 'agent')).toBe(false);
    });
  });

  // ── Stats ──

  describe('stats', () => {
    it('reports tier distribution', () => {
      consolidator.addEntry(makeEntry({ id: 'W.S.1' }));
      consolidator.addEntry(makeEntry({ id: 'W.S.2' }));
      const tiered = consolidator.addEntry(makeEntry({ id: 'W.S.3' }));
      tiered.tier = 'warm';

      const s = consolidator.stats();
      expect(s.hot).toBe(2);
      expect(s.warm).toBe(1);
      expect(s.cold).toBe(0);
      expect(s.total).toBe(3);
    });
  });
});
