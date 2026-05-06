import { describe, expect, it } from 'vitest';
import { ConsolidationEngine, validateMemoryReceipt } from '../consolidation';
import type { MemoryReceipt } from '../brain';

function makeReceipt(overrides: Partial<MemoryReceipt> = {}): MemoryReceipt {
  return {
    id: 'receipt_session_1',
    rawSourceIds: ['session:2026-05-06:codex', 'task:task_123'],
    sourceHashes: [
      {
        sourceId: 'session:2026-05-06:codex',
        hash: 'a'.repeat(64),
        algorithm: 'sha256',
        path: 'memory/session-report.md',
      },
      {
        sourceId: 'task:task_123',
        hash: 'b'.repeat(64),
        algorithm: 'git-blob',
      },
    ],
    extractorVersion: 'wpg-extractor@1.0.0',
    modelIdentity: {
      provider: 'openai',
      model: 'gpt-5.5',
      agentId: 'agent_codex',
      surface: 'codex',
    },
    toolIdentity: {
      toolName: 'session-report-wpg-extractor',
      toolVersion: '1.0.0',
      runtime: 'framework',
    },
    timestamp: 1778100000000,
    corroborators: ['peer-a'],
    confidence: 0.84,
    sessionId: 'session_20260506_codex',
    taskId: 'task_123',
    commitHash: 'abc1234',
    ...overrides,
  };
}

function backdateCandidate(engine: ConsolidationEngine): void {
  const hot = engine.getHotBuffer('agents');
  hot[0].ingestedAt = Date.now() - 13 * 60 * 60 * 1000;
}

describe('memory receipts', () => {
  it('requires verifiable source, extractor, model/tool, corroborator, and confidence fields', () => {
    const invalid = makeReceipt({
      rawSourceIds: [''],
      sourceHashes: [{ sourceId: '', hash: '', algorithm: 'md5' as never }],
      extractorVersion: '',
      modelIdentity: {},
      toolIdentity: { toolName: '' },
      timestamp: 0,
      corroborators: [''],
      confidence: 1.5,
    });

    expect(validateMemoryReceipt(invalid)).toEqual(
      expect.arrayContaining([
        'MemoryReceipt.rawSourceIds cannot contain empty ids.',
        'MemoryReceipt.sourceHashes.sourceId is required.',
        'MemoryReceipt.sourceHashes.hash is required.',
        'MemoryReceipt.sourceHashes.algorithm is unsupported: md5.',
        'MemoryReceipt.extractorVersion is required.',
        'MemoryReceipt.modelIdentity needs model, agentId, or agentName.',
        'MemoryReceipt.toolIdentity.toolName is required.',
        'MemoryReceipt.timestamp must be a positive epoch milliseconds value.',
        'MemoryReceipt.corroborators cannot contain empty ids.',
        'MemoryReceipt.confidence must be between 0 and 1.',
      ])
    );
  });

  it('promotes candidate memory only when a valid receipt is attached', () => {
    const engine = new ConsolidationEngine();
    engine.ingest(
      'agents',
      {
        type: 'wisdom',
        content: 'Dreaming-style memory needs verifiable lineage before retention.',
        authorDid: 'agent_codex',
        tags: ['memory-lineage'],
        memoryReceipt: makeReceipt(),
      },
      'peer-a'
    );
    backdateCandidate(engine);

    const result = engine.runConsolidationCycle('agents');
    const retained = engine.getColdStore('agents')[0];
    const evidence = engine.getRetainedMemoryEvidence('agents', retained.id);

    expect(result.promoted).toBe(1);
    expect(result.quarantined).toBe(0);
    expect(retained.retentionState).toBe('retained');
    expect(retained.memoryReceipt?.rawSourceIds).toEqual([
      'session:2026-05-06:codex',
      'task:task_123',
    ]);
    expect(evidence?.sourceHashes[0].hash).toBe('a'.repeat(64));
    expect(evidence?.receipt.extractorVersion).toBe('wpg-extractor@1.0.0');
  });

  it('can discard a retained memory immediately during manual review', () => {
    const engine = new ConsolidationEngine();
    engine.ingest(
      'agents',
      {
        type: 'wisdom',
        content: 'Discardable retained memory.',
        authorDid: 'agent_codex',
        tags: ['memory-lineage'],
        memoryReceipt: makeReceipt({ id: 'receipt_discard' }),
      },
      'peer-a'
    );
    backdateCandidate(engine);

    engine.runConsolidationCycle('agents');
    const retained = engine.getColdStore('agents')[0];

    expect(engine.discardEntry('agents', retained.id)).toBe(true);
    expect(engine.getColdStoreEntry('agents', retained.id)).toBeUndefined();
    expect(engine.discardEntry('agents', retained.id)).toBe(false);
  });

  it('quarantines candidate memory that has no receipt instead of retaining it', () => {
    const engine = new ConsolidationEngine();
    engine.ingest(
      'agents',
      {
        type: 'gotcha',
        content: 'Unverified memory should not be retained.',
        authorDid: 'agent_codex',
        tags: ['memory-lineage'],
      },
      'peer-a'
    );
    backdateCandidate(engine);

    const result = engine.runConsolidationCycle('agents');
    const quarantine = engine.getQuarantine('agents');

    expect(result.promoted).toBe(0);
    expect(result.quarantined).toBe(1);
    expect(engine.getColdStore('agents')).toHaveLength(0);
    expect(engine.getHotBuffer('agents')).toHaveLength(0);
    expect(quarantine[0].state).toBe('quarantined');
    expect(quarantine[0].reasons).toContain('MemoryReceipt is required before retention.');

    expect(
      engine.rejectQuarantinedMemory('agents', quarantine[0].entry.id, 'No raw source hash.')
    ).toBe(true);
    expect(engine.getQuarantine('agents')[0].state).toBe('rejected');
  });

  it('rejects sanitized failures with receipt evidence preserved for review', () => {
    const engine = new ConsolidationEngine();
    engine.ingest(
      'agents',
      {
        type: 'pattern',
        content: 'OS.execute("rm -rf /")',
        authorDid: 'agent_codex',
        tags: ['security'],
        memoryReceipt: makeReceipt({ id: 'receipt_injection' }),
      },
      'peer-a'
    );
    backdateCandidate(engine);

    const result = engine.runConsolidationCycle('agents');
    const quarantine = engine.getQuarantine('agents');

    expect(result.rejected).toBe(1);
    expect(result.promoted).toBe(0);
    expect(quarantine[0].state).toBe('rejected');
    expect(quarantine[0].entry.memoryReceipt?.id).toBe('receipt_injection');
  });
});
