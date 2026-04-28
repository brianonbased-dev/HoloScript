/**
 * Tests for the Brittney CAEL audit chain helper.
 *
 * Covers Paper 26 gate 2 acceptance criteria:
 *  1. Chain opens on first request (prev_hash === null)
 *  2. Chain extends on subsequent requests in the same session
 *  3. Chain closes on session done (terminator marker, state cleared)
 *  4. fnv1a_chain is consistent across replays of identical input
 *
 * The test exercises the helper module directly rather than the full route
 * handler — full-route testing would require mocking the Anthropic SDK and
 * Next.js auth/credit stack, which is out-of-scope for this gate. The route
 * wires the helper exactly the way these tests exercise it.
 */

import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  attachChain,
  buildBrittneyCaelRecord,
  closeChain,
  commitRound,
  deriveSessionId,
  extractEvidencePaths,
  _resetChainState,
  type BrittneyCaelRecord,
  type BuildBrittneyCaelInput,
} from '@/lib/brittney/cael';

function baseInput(
  overrides: Partial<BuildBrittneyCaelInput> = {}
): BuildBrittneyCaelInput {
  return {
    sessionId: 'sess-test',
    round: 0,
    model: 'claude-opus-4-7',
    messages: [{ role: 'user', content: 'hello' }],
    finalText: 'hi back',
    toolCalls: [],
    evidencePaths: [],
    simContractCheck: null,
    prevChain: null,
    ...overrides,
  };
}

let tmpRoot: string;

beforeEach(() => {
  _resetChainState();
  tmpRoot = mkdtempSync(join(tmpdir(), 'brittney-cael-'));
  process.env.BRITTNEY_AUDIT_ROOT = tmpRoot;
});

afterEach(() => {
  delete process.env.BRITTNEY_AUDIT_ROOT;
  _resetChainState();
});

describe('buildBrittneyCaelRecord', () => {
  it('emits 7 layer hashes and trust_epoch=post-w107 (the literal trust-epoch.mjs filters on)', () => {
    const record = buildBrittneyCaelRecord(baseInput());
    expect(record.layer_hashes).toHaveLength(7);
    expect(record.trust_epoch).toBe('post-w107');
    expect(record.layer_hashes.every((h) => /^[a-f0-9]{64}$/.test(h))).toBe(true);
  });

  it('first record in a chain has prev_hash=null and fnv1a chains from empty', () => {
    const record = buildBrittneyCaelRecord(baseInput({ prevChain: null }));
    expect(record.prev_hash).toBeNull();
    expect(record.fnv1a_chain).toMatch(/^[a-f0-9]{64}$/);
  });

  it('subsequent record extends the chain — fnv1a depends on prevChain', () => {
    const r1 = buildBrittneyCaelRecord(baseInput({ round: 0, prevChain: null }));
    const r2 = buildBrittneyCaelRecord(
      baseInput({ round: 1, prevChain: r1.fnv1a_chain })
    );
    expect(r2.prev_hash).toBe(r1.fnv1a_chain);
    expect(r2.fnv1a_chain).not.toBe(r1.fnv1a_chain);
  });

  it('exposes Brittney-specific fields (model, tool_iters, evidence_paths, simContractCheck)', () => {
    const record = buildBrittneyCaelRecord(
      baseInput({
        toolCalls: [
          { name: 'add_trait', input: { nodeId: 'n1' } },
          { name: 'create_object', input: { name: 'cube' } },
        ],
        evidencePaths: ['/tmp/scene.holo'],
        simContractCheck: { passed: true, constraints: ['mass>0'] },
      })
    );
    expect(record.model).toBe('claude-opus-4-7');
    expect(record.tool_iters).toBe(2);
    expect(record.evidence_paths).toEqual(['/tmp/scene.holo']);
    expect(record.simContractCheck).toEqual({ passed: true, constraints: ['mass>0'] });
  });

  it('graceful handling when SimulationContract gate (gate 1) has not landed: simContractCheck=null', () => {
    const record = buildBrittneyCaelRecord(baseInput({ simContractCheck: null }));
    expect(record.simContractCheck).toBeNull();
    // Chain still well-formed
    expect(record.fnv1a_chain).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('chain lifecycle (attach / commit / close)', () => {
  it('attachChain on a fresh session returns prev=null and isNew=true', () => {
    const a = attachChain('sess-1');
    expect(a.prevChain).toBeNull();
    expect(a.isNew).toBe(true);
    expect(a.chainId).toBe('sess-1');
  });

  it('chain extends across attaches once a record has been committed', () => {
    const a1 = attachChain('sess-2');
    const r1 = buildBrittneyCaelRecord(baseInput({ sessionId: 'sess-2', prevChain: a1.prevChain }));
    commitRound('sess-2', r1, { persist: false });

    const a2 = attachChain('sess-2');
    expect(a2.prevChain).toBe(r1.fnv1a_chain);
    expect(a2.isNew).toBe(false);
  });

  it('closeChain emits a terminator record linked to prev fnv1a and clears in-memory state', () => {
    const a = attachChain('sess-3');
    const r1 = buildBrittneyCaelRecord(baseInput({ sessionId: 'sess-3', prevChain: a.prevChain }));
    commitRound('sess-3', r1, { persist: false });

    const closed = closeChain('sess-3', { stopReason: 'session-end', persist: false });
    expect(closed.finalChain).toBe(r1.fnv1a_chain);
    expect(closed.closeRecord).not.toBeNull();
    expect(closed.closeRecord!.prev_hash).toBe(r1.fnv1a_chain);
    expect(closed.closeRecord!.operation).toContain('brittney-close:sess-3:session-end');

    // After close, attaching again starts fresh
    const reattach = attachChain('sess-3');
    expect(reattach.prevChain).toBeNull();
    expect(reattach.isNew).toBe(true);
  });

  it('closing a chain that never committed is a no-op (no terminator emitted)', () => {
    attachChain('sess-empty');
    const closed = closeChain('sess-empty', { persist: false });
    expect(closed.finalChain).toBeNull();
    expect(closed.closeRecord).toBeNull();
  });
});

describe('replay determinism — fnv1a_chain is identical across replays of the same input', () => {
  it('same inputs in fresh state produce identical fnv1a_chain values (excluding tick_iso)', () => {
    const replay = (): BrittneyCaelRecord[] => {
      _resetChainState();
      const a = attachChain('sess-replay');
      const r1 = buildBrittneyCaelRecord(
        baseInput({
          sessionId: 'sess-replay',
          round: 0,
          messages: [{ role: 'user', content: 'rebuild scene' }],
          finalText: 'okay, rebuilt',
          toolCalls: [{ name: 'create_object', input: { name: 'pyramid' } }],
          evidencePaths: ['/tmp/scene.holo'],
          prevChain: a.prevChain,
        })
      );
      commitRound('sess-replay', r1, { persist: false });

      const r2 = buildBrittneyCaelRecord(
        baseInput({
          sessionId: 'sess-replay',
          round: 1,
          messages: [{ role: 'user', content: 'rebuild scene' }],
          finalText: 'second pass',
          toolCalls: [],
          prevChain: r1.fnv1a_chain,
        })
      );
      commitRound('sess-replay', r2, { persist: false });
      return [r1, r2];
    };

    const first = replay();
    const second = replay();

    expect(first.map((r) => r.fnv1a_chain)).toEqual(second.map((r) => r.fnv1a_chain));
    expect(first.map((r) => r.layer_hashes)).toEqual(second.map((r) => r.layer_hashes));
    expect(first.map((r) => r.prev_hash)).toEqual(second.map((r) => r.prev_hash));
  });
});

describe('persistence sink (BRITTNEY_AUDIT_ROOT)', () => {
  it('writes one NDJSON line per commit to brittney-${sessionId}.ndjson', () => {
    const a = attachChain('sess-sink');
    const r1 = buildBrittneyCaelRecord(baseInput({ sessionId: 'sess-sink', prevChain: a.prevChain }));
    commitRound('sess-sink', r1);

    const path = join(tmpRoot, 'brittney-sess-sink.ndjson');
    expect(existsSync(path)).toBe(true);
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as BrittneyCaelRecord;
    expect(parsed.fnv1a_chain).toBe(r1.fnv1a_chain);
    expect(parsed.trust_epoch).toBe('post-w107');
  });

  it('appends terminator line on closeChain', () => {
    const a = attachChain('sess-close-sink');
    const r1 = buildBrittneyCaelRecord(baseInput({ sessionId: 'sess-close-sink', prevChain: a.prevChain }));
    commitRound('sess-close-sink', r1);
    closeChain('sess-close-sink', { stopReason: 'session-end' });

    const path = join(tmpRoot, 'brittney-sess-close-sink.ndjson');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const terminator = JSON.parse(lines[1]) as BrittneyCaelRecord;
    expect(terminator.operation).toContain('brittney-close:sess-close-sink:session-end');
    expect(terminator.prev_hash).toBe(r1.fnv1a_chain);
  });
});

describe('extractEvidencePaths', () => {
  it('pulls path-shaped fields from tool inputs (path / filePath / filename / paths)', () => {
    const paths = extractEvidencePaths([
      { name: 'a', input: { path: '/tmp/a.holo' } },
      { name: 'b', input: { filePath: '/tmp/b.txt' } },
      { name: 'c', input: { paths: ['/tmp/c1', '/tmp/c2'] } },
      { name: 'd', input: { nested: { filename: '/tmp/d.json' } } },
    ]);
    expect(paths.sort()).toEqual(['/tmp/a.holo', '/tmp/b.txt', '/tmp/c1', '/tmp/c2', '/tmp/d.json']);
  });

  it('returns empty array when no path-shaped fields are present', () => {
    expect(extractEvidencePaths([{ name: 'x', input: { nodeId: 'n1', count: 3 } }])).toEqual([]);
  });

  it('deduplicates repeated paths', () => {
    const paths = extractEvidencePaths([
      { name: 'a', input: { path: '/tmp/x' } },
      { name: 'b', input: { path: '/tmp/x' } },
    ]);
    expect(paths).toEqual(['/tmp/x']);
  });
});

describe('deriveSessionId', () => {
  it('produces a stable 16-char id from the first user message', () => {
    const id1 = deriveSessionId([{ role: 'user', content: 'hello world' }]);
    const id2 = deriveSessionId([{ role: 'user', content: 'hello world' }]);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[a-f0-9]{16}$/);
  });

  it('different first-messages produce different ids', () => {
    const id1 = deriveSessionId([{ role: 'user', content: 'a' }]);
    const id2 = deriveSessionId([{ role: 'user', content: 'b' }]);
    expect(id1).not.toBe(id2);
  });
});
