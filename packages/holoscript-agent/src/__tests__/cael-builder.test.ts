import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildCaelRecord, type BuildCaelRecordInput } from '../cael-builder.js';
import type { AgentIdentity, BoardTask, RuntimeBrainConfig } from '../types.js';

const identity: AgentIdentity = {
  handle: 'mesh-worker-02',
  surface: 'unknown',
  wallet: '0xabc',
  x402Bearer: 'tok_123',
  llmProvider: 'local-llm',
  llmModel: 'Qwen/Qwen2.5-0.5B-Instruct',
  brainPath: 'compositions/trait-inference-brain.hsplus',
  budgetUsdPerDay: 1,
  teamId: 'team_test',
  meshApiBase: 'https://mcp.holoscript.net',
};

const brain: RuntimeBrainConfig = {
  brainPath: 'compositions/trait-inference-brain.hsplus',
  systemPrompt: 'You are a trait-inference agent.',
  capabilityTags: ['paper-19', 'trait-inference'],
  domain: 'trait-inference',
  scopeTier: 'warm',
};

const task: BoardTask = {
  id: 'task_test_42',
  title: 'Annotate hsplus example',
  description: 'Add @vrchat trait to scene_001.hsplus',
  priority: 'medium',
  tags: ['paper-19', 'trait-inference'],
  status: 'open',
};

const baseInput: BuildCaelRecordInput = {
  identity,
  brain,
  task,
  messages: [
    { role: 'system', content: brain.systemPrompt },
    { role: 'user', content: 'do the task' },
  ],
  finalText: 'Done. Trait @vrchat added.',
  usage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 },
  costUsd: 0.0042,
  spentUsd: 0.0042,
  prevChain: null,
  runtimeVersion: '1.0.0',
};

describe('buildCaelRecord', () => {
  it('emits 7 layer hashes (W.090 invariant)', () => {
    const r = buildCaelRecord(baseInput);
    expect(r.layer_hashes).toHaveLength(7);
    for (const h of r.layer_hashes) expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('passes server-side shape validator (core-routes.ts:512-518)', () => {
    const r = buildCaelRecord(baseInput);
    expect(typeof r.tick_iso).toBe('string');
    expect(Array.isArray(r.layer_hashes)).toBe(true);
    expect(r.layer_hashes).toHaveLength(7);
    expect(typeof r.operation).toBe('string');
    expect(typeof r.fnv1a_chain).toBe('string');
  });

  it('chains fnv1a from prev_hash null on first record', () => {
    const r = buildCaelRecord(baseInput);
    expect(r.prev_hash).toBeNull();
    const expectedChain = createHash('sha256')
      .update(`|${r.layer_hashes[6]}`, 'utf8')
      .digest('hex');
    expect(r.fnv1a_chain).toBe(expectedChain);
  });

  it('chains fnv1a from prev_hash on subsequent records', () => {
    const r1 = buildCaelRecord(baseInput);
    const r2 = buildCaelRecord({ ...baseInput, prevChain: r1.fnv1a_chain });
    expect(r2.prev_hash).toBe(r1.fnv1a_chain);
    expect(r2.fnv1a_chain).not.toBe(r1.fnv1a_chain);
  });

  it('extracts brain_class from compositions path', () => {
    const r = buildCaelRecord(baseInput);
    expect(r.brain_class).toBe('trait-inference');
  });

  it('encodes runtime + brain + provider + model in version_vector_fingerprint', () => {
    const r = buildCaelRecord(baseInput);
    expect(r.version_vector_fingerprint).toContain('agent@1.0.0');
    expect(r.version_vector_fingerprint).toContain('brain@trait-inference');
    expect(r.version_vector_fingerprint).toContain('provider@local-llm');
    expect(r.version_vector_fingerprint).toContain('model@Qwen/Qwen2.5-0.5B-Instruct');
  });

  it('operation field is task-scoped for downstream filtering', () => {
    const r = buildCaelRecord(baseInput);
    expect(r.operation).toBe('task-executed:task_test_42');
  });

  it('layer_hashes change when any input changes (no constant-folding bug)', () => {
    const r0 = buildCaelRecord(baseInput);
    const r1 = buildCaelRecord({ ...baseInput, finalText: 'different output' });
    expect(r0.layer_hashes[3]).not.toBe(r1.layer_hashes[3]);
    expect(r0.layer_hashes[6]).not.toBe(r1.layer_hashes[6]);
  });
});
