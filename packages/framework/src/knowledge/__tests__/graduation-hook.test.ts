import { describe, it, expect } from 'vitest';
import { ConsolidationEngine, type ColdStoreEntry } from '../consolidation';
import type { MemoryReceipt } from '../brain';

function makeReceipt(overrides: Partial<MemoryReceipt> = {}): MemoryReceipt {
  return {
    id: 'receipt_grad_1',
    rawSourceIds: ['session:2026-06-13:claude', 'task:task_mem'],
    sourceHashes: [
      { sourceId: 'session:2026-06-13:claude', hash: 'a'.repeat(64), algorithm: 'sha256' },
    ],
    extractorVersion: 'wpg-extractor@1.0.0',
    modelIdentity: { agentId: 'agent_claude' },
    toolIdentity: { toolName: 'graduation-hook-test', toolVersion: '1.0.0', runtime: 'framework' },
    timestamp: 1778100000000,
    corroborators: ['peer-a'],
    confidence: 0.9,
    ...overrides,
  };
}

/** Push the candidate past the hot-buffer TTL gate so a cycle promotes it. */
function backdate(engine: ConsolidationEngine): void {
  const hot = engine.getHotBuffer('agents');
  if (hot[0]) hot[0].ingestedAt = Date.now() - 13 * 60 * 60 * 1000;
}

function ingestVerified(engine: ConsolidationEngine, content: string): void {
  engine.ingest(
    'agents',
    { type: 'wisdom', content, authorDid: 'agent_claude', tags: ['grad-test'], memoryReceipt: makeReceipt() },
    'peer-a'
  );
  backdate(engine);
}

describe('ConsolidationEngine graduationHook', () => {
  it('fires in the PROMOTE phase with the promoted cold-store entries', () => {
    const fired: ColdStoreEntry[] = [];
    const engine = new ConsolidationEngine({
      graduationHook: (entries) => {
        fired.push(...entries);
      },
    });

    ingestVerified(engine, 'Verified lesson worth graduating.');
    const result = engine.runConsolidationCycle('agents');

    expect(result.promoted).toBe(1);
    expect(fired).toHaveLength(1);
    expect(fired[0].content).toBe('Verified lesson worth graduating.');
    expect(fired[0].retentionState).toBe('retained');
    expect(fired[0].memoryReceipt?.extractorVersion).toBe('wpg-extractor@1.0.0');
  });

  it('does NOT fire when nothing is promoted (no receipt → quarantined)', () => {
    const fired: ColdStoreEntry[] = [];
    const engine = new ConsolidationEngine({
      graduationHook: (entries) => {
        fired.push(...entries);
      },
    });

    // No memoryReceipt → SANITIZE quarantines it; promote count stays 0.
    engine.ingest('agents', { type: 'wisdom', content: 'No receipt.', authorDid: 'a', tags: [] }, 'peer-a');
    backdate(engine);
    const result = engine.runConsolidationCycle('agents');

    expect(result.promoted).toBe(0);
    expect(fired).toHaveLength(0);
  });

  it('isolates a synchronously-throwing hook — the cycle still promotes', () => {
    const engine = new ConsolidationEngine({
      graduationHook: () => {
        throw new Error('hook intentional failure');
      },
    });

    ingestVerified(engine, 'Promotes despite a throwing hook.');
    let result: ReturnType<ConsolidationEngine['runConsolidationCycle']> | undefined;
    expect(() => {
      result = engine.runConsolidationCycle('agents');
    }).not.toThrow();
    expect(result?.promoted).toBe(1);
    expect(engine.getColdStore('agents')).toHaveLength(1);
  });

  it('passes a defensive copy — mutating the snapshot does not corrupt cold store', () => {
    const engine = new ConsolidationEngine({
      graduationHook: (entries) => {
        entries[0].content = 'MUTATED';
      },
    });

    ingestVerified(engine, 'Original content.');
    engine.runConsolidationCycle('agents');

    expect(engine.getColdStore('agents')[0].content).toBe('Original content.');
  });

  it('is a no-op when no hook is supplied (back-compat)', () => {
    const engine = new ConsolidationEngine();
    ingestVerified(engine, 'Works without a hook.');
    const result = engine.runConsolidationCycle('agents');
    expect(result.promoted).toBe(1);
  });
});
