import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getConsolidationBridge,
  resetConsolidationBridge,
} from '../consolidation-bridge';
import type { MeshKnowledgeEntry } from '../types';

describe('HoloMeshConsolidationBridge', () => {
  beforeEach(() => {
    resetConsolidationBridge({ clearPersistence: true });
  });

  afterEach(() => {
    resetConsolidationBridge({ clearPersistence: true });
  });

  it('ingests a knowledge entry and promotes after sleep cycle', () => {
    const bridge = getConsolidationBridge();

    const entry: MeshKnowledgeEntry = {
      id: 'entry_test_1',
      workspaceId: 'ai-ecosystem',
      type: 'wisdom',
      content: 'Dreaming-style memory needs verifiable lineage before retention.',
      provenanceHash: 'a'.repeat(64),
      authorId: 'agent_codex',
      authorName: 'Codex',
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'agents',
      tags: ['memory-lineage'],
      confidence: 0.84,
      createdAt: new Date().toISOString(),
    };

    bridge.ingestKnowledgeEntry(entry, 'peer-a');

    // Manually back-date the hot buffer entry so it passes TTL
    const engine = (bridge as any).engine;
    const hot = engine.getHotBuffer('agents');
    hot[0].ingestedAt = Date.now() - 13 * 60 * 60 * 1000;
    engine['hotBuffers'].set('agents', hot);

    const results = bridge.triggerManual('test');
    expect(results.length).toBeGreaterThan(0);
    const agentsResult = results.find((r) => r.domain === 'agents');
    expect(agentsResult?.promoted).toBe(1);
    expect(agentsResult?.quarantined).toBe(0);

    const stats = bridge.getStats();
    expect(stats.coldStore.find((c) => c.domain === 'agents')?.count).toBe(1);
  });

  it('quarantines entry without valid receipt and preserves it for review', () => {
    const bridge = getConsolidationBridge();

    const entry: MeshKnowledgeEntry = {
      id: 'entry_test_2',
      workspaceId: 'ai-ecosystem',
      type: 'gotcha',
      content: 'Unverified memory should not be retained.',
      provenanceHash: '',
      authorId: 'agent_codex',
      authorName: 'Codex',
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'agents',
      tags: ['memory-lineage'],
      confidence: 0.84,
      createdAt: new Date().toISOString(),
    };

    bridge.ingestKnowledgeEntry(entry, 'peer-a');

    const engine = (bridge as any).engine;
    const hot = engine.getHotBuffer('agents');
    hot[0].ingestedAt = Date.now() - 13 * 60 * 60 * 1000;
    engine['hotBuffers'].set('agents', hot);

    const results = bridge.triggerManual('test');
    const agentsResult = results.find((r) => r.domain === 'agents');
    expect(agentsResult?.promoted).toBe(0);
    expect(agentsResult?.quarantined).toBe(1);

    const review = bridge.getReviewSet();
    expect(review.stats.quarantinedCount).toBe(1);
    expect(review.quarantined[0].state).toBe('quarantined');
  });

  it('rejects sanitized injection entries with receipt preserved', () => {
    const bridge = getConsolidationBridge();

    const entry: MeshKnowledgeEntry = {
      id: 'entry_test_3',
      workspaceId: 'ai-ecosystem',
      type: 'pattern',
      content: 'OS.execute("rm -rf /")',
      provenanceHash: 'b'.repeat(64),
      authorId: 'agent_codex',
      authorName: 'Codex',
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'general',
      tags: ['security'],
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    };

    bridge.ingestKnowledgeEntry(entry, 'peer-a');

    const engine = (bridge as any).engine;
    const hot = engine.getHotBuffer('general');
    hot[0].ingestedAt = Date.now() - 7 * 60 * 60 * 1000;
    engine['hotBuffers'].set('general', hot);

    const results = bridge.triggerManual('test');
    const generalResult = results.find((r) => r.domain === 'general');
    expect(generalResult?.rejected).toBe(1);
    expect(generalResult?.promoted).toBe(0);

    const review = bridge.getReviewSet();
    expect(review.stats.rejectedCount).toBe(1);
    expect(review.rejected[0].entry.memoryReceipt).toBeDefined();
  });

  it('logs runs and supports rollback', () => {
    const bridge = getConsolidationBridge();

    const entry: MeshKnowledgeEntry = {
      id: 'entry_test_4',
      workspaceId: 'ai-ecosystem',
      type: 'wisdom',
      content: 'Rollback test content.',
      provenanceHash: 'c'.repeat(64),
      authorId: 'agent_codex',
      authorName: 'Codex',
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'general',
      tags: ['rollback'],
      confidence: 0.9,
      createdAt: new Date().toISOString(),
    };

    bridge.ingestKnowledgeEntry(entry, 'peer-a');

    const engine = (bridge as any).engine;
    const hot = engine.getHotBuffer('general');
    hot[0].ingestedAt = Date.now() - 7 * 60 * 60 * 1000;
    engine['hotBuffers'].set('general', hot);

    bridge.triggerManual('before rollback');
    expect(bridge.getStats().coldStore.find((c) => c.domain === 'general')?.count).toBe(1);

    const { discarded, domains } = bridge.rollback({ depth: 1 });
    expect(discarded).toBe(1);
    expect(domains).toContain('general');

    const logs = bridge.getRunLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].rolledBack).toBe(true);
    expect(logs[0].rollbackAt).toBeDefined();

    expect(bridge.getStats().coldStore.find((c) => c.domain === 'general')?.count).toBe(0);
  });

  it('ingests session reports into the agents domain', () => {
    const bridge = getConsolidationBridge();
    const id = bridge.ingestSessionReport(
      'Session report content.',
      'session_20260506_codex',
      'agent_codex',
      { taskId: 'task_123', commitHash: 'abc1234', tags: ['session'] }
    );
    expect(id).toMatch(/^hot_agents_/);

    const engine = (bridge as any).engine;
    const hot = engine.getHotBuffer('agents');
    expect(hot.length).toBe(1);
    expect(hot[0].type).toBe('session-report');
    expect(hot[0].memoryReceipt?.sessionId).toBe('session_20260506_codex');
  });

  it('entropy trigger fires when delta exceeds threshold', () => {
    const bridge = getConsolidationBridge();

    // Prime entropy snapshot
    bridge.triggerEntropy(0); // sets baseline

    // Ingest many entries to create entropy
    for (let i = 0; i < 20; i++) {
      bridge.ingestKnowledgeEntry(
        {
          id: `entropy_${i}`,
          workspaceId: 'ai-ecosystem',
          type: 'wisdom',
          content: `Entropy entry ${i}`,
          provenanceHash: `${i}`.repeat(64).slice(0, 64),
          authorId: 'agent_a',
          authorName: 'A',
          price: 0,
          queryCount: 0,
          reuseCount: 0,
          domain: 'general',
          tags: [],
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
        'peer-a'
      );
    }

    const results = bridge.triggerEntropy(5);
    expect(results.length).toBeGreaterThan(0); // entropy delta >= threshold should fire
  });
});
