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

  // Tier coverage for brainClassOf() — task_1777112258989_9ii0.
  //
  // Live evidence (2026-04-25 mw01 audit record):
  //   brainPath = '/root/ai-ecosystem/compositions/lean-theorist-brain.hsplus'
  //   emitted   brain_class = 'unknown'
  //
  // Original regex was rooted on the literal `compositions/` segment but used a
  // path-anchor that missed when the absolute path had `/root/ai-ecosystem/`
  // ahead of it on Vast.ai workers. Commit b39239e28 (2026-04-25) promoted
  // brainClassOf() to a 4-tier resolver. These tests pin every tier so the
  // bug can't recur silently.

  it('Tier 1: absolute path with compositions/ segment (mw01 production case)', () => {
    // The exact production path that emitted brain@unknown on 2026-04-25.
    const absoluteInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: '/root/ai-ecosystem/compositions/lean-theorist-brain.hsplus',
        domain: 'lean-theorist',
      },
    };
    const r = buildCaelRecord(absoluteInput);
    expect(r.brain_class).toBe('lean-theorist');
    expect(r.version_vector_fingerprint).toContain('brain@lean-theorist');
    expect(r.version_vector_fingerprint).not.toContain('brain@unknown');
  });

  it('Tier 1: Windows-style backslash path with compositions segment', () => {
    const winInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: 'C:\\Users\\Josep\\repo\\compositions\\security-auditor-brain.hsplus',
        domain: 'security-auditor',
      },
    };
    const r = buildCaelRecord(winInput);
    expect(r.brain_class).toBe('security-auditor');
  });

  it('Tier 2: arbitrary path with <class>-brain.hsplus basename (Vast.ai layout)', () => {
    // Vast.ai box layouts where the brain landed outside compositions/.
    const vastInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: '/var/lib/holoscript/brains/trait-inference-brain.hsplus',
        domain: 'trait-inference',
      },
    };
    const r = buildCaelRecord(vastInput);
    expect(r.brain_class).toBe('trait-inference');
  });

  it('Tier 3: bare basename without -brain suffix', () => {
    // Some deploys symlink to a flat file; resolver still recovers a class.
    const flatInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: 'snn-research.hsplus',
        domain: 'snn-research',
      },
    };
    const r = buildCaelRecord(flatInput);
    expect(r.brain_class).toBe('snn-research');
  });

  it('Tier 4: empty brainPath falls through to brain.domain', () => {
    // Brain loaded from non-file source (in-memory composition, env-var blob);
    // path is unset but domain is populated from the .hsplus identity block.
    const domainInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: '',
        domain: 'accessibility-researcher',
      },
    };
    const r = buildCaelRecord(domainInput);
    expect(r.brain_class).toBe('accessibility-researcher');
  });

  it('Tier 5: all sources unresolvable -> unknown (last-resort fallback)', () => {
    const unknownInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: '/no/match/here/at/all',
        domain: '',
      },
    };
    const r = buildCaelRecord(unknownInput);
    expect(r.brain_class).toBe('unknown');
    expect(r.version_vector_fingerprint).toContain('brain@unknown');
  });

  it('Tier 5: domain="unknown" is treated as unresolved (W.110 trust-epoch hygiene)', () => {
    // Defense against a brain composition that literally sets domain:'unknown'
    // overshadowing the path tier — should still emit 'unknown', not pretend
    // it resolved. Aligns with W.110: untrusted records must look untrusted.
    const ambiguousInput: BuildCaelRecordInput = {
      ...baseInput,
      brain: {
        ...brain,
        brainPath: '/no/segment/with/no/match.txt',
        domain: 'unknown',
      },
    };
    const r = buildCaelRecord(ambiguousInput);
    expect(r.brain_class).toBe('unknown');
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
