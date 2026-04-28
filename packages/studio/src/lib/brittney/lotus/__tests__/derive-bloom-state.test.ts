/**
 * Tests for derivePetalBloomState — the algebraic-trust hook for Paper 26.
 *
 * These tests pin the bloom-state lifecycle invariants. If any of them
 * change, Brittney's `bloom_petal` / `wilt_petal` semantics shift — and
 * the Lotus Genesis Trigger condition (I.007) shifts with them. So this
 * file is load-bearing for the paper program; treat changes as design
 * decisions, not refactors.
 */

import { describe, it, expect } from 'vitest';
import {
  derivePetalBloomState,
  deriveLotusGenesisReadiness,
  type PetalEvidence,
} from '../derive-bloom-state';

const baseEvidence = (overrides: Partial<PetalEvidence> = {}): PetalEvidence => ({
  paperId: 'test-paper',
  hasDraft: false,
  stubCount: 0,
  benchmarkTodoCount: 0,
  otsAnchored: false,
  baseAnchored: false,
  anchorMismatch: false,
  ...overrides,
});

describe('derivePetalBloomState', () => {
  it('sealed: no draft → sealed', () => {
    const result = derivePetalBloomState(baseEvidence({ hasDraft: false }));
    expect(result.state).toBe('sealed');
    expect(result.blockedBy).toContain('hasDraft');
  });

  it('budding: draft + stubs → budding', () => {
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 3,
    }));
    expect(result.state).toBe('budding');
    expect(result.reason).toContain('3');
    expect(result.blockedBy).toContain('stubCount');
  });

  it('blooming: draft, no stubs, has benchmark-todos → blooming', () => {
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 2,
    }));
    expect(result.state).toBe('blooming');
    expect(result.reason).toContain('2 benchmark');
    expect(result.blockedBy).toContain('benchmarkTodoCount');
  });

  it('blooming: draft, no stubs, no benchmark-todos, missing OTS anchor → blooming (anchor gate)', () => {
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 0,
      otsAnchored: false,
      baseAnchored: true,
    }));
    expect(result.state).toBe('blooming');
    expect(result.reason).toContain('OpenTimestamps');
    expect(result.blockedBy).toContain('otsAnchored');
  });

  it('blooming: missing Base anchor only → blooming (anchor gate)', () => {
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 0,
      otsAnchored: true,
      baseAnchored: false,
    }));
    expect(result.state).toBe('blooming');
    expect(result.reason).toContain('Base L2');
    expect(result.blockedBy).toContain('baseAnchored');
  });

  it('full: draft, no stubs, no benchmark-todos, dual-anchored → full', () => {
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 0,
      otsAnchored: true,
      baseAnchored: true,
    }));
    expect(result.state).toBe('full');
    expect(result.blockedBy).toBeUndefined();
  });

  it('wilted: retracted overrides everything → wilted (terminal)', () => {
    // Even a fully-anchored paper goes to wilted if retracted. This is the
    // Lotus's "graceful death" pathway — the petal is preserved in scene
    // but visually marked as withered, and Lotus Genesis cannot fire.
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 0,
      otsAnchored: true,
      baseAnchored: true,
      retracted: true,
    }));
    expect(result.state).toBe('wilted');
    expect(result.reason).toContain('retracted');
    expect(result.blockedBy).toContain('retracted');
  });

  it('wilted: anchor mismatch + no surviving anchors → wilted (provenance break)', () => {
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      anchorMismatch: true,
      otsAnchored: false,
      baseAnchored: false,
    }));
    expect(result.state).toBe('wilted');
    expect(result.reason).toContain('provenance break');
  });

  it('NOT wilted: anchor mismatch with surviving anchors is NORMAL during editing', () => {
    // Per matrix 2026-04-24 refresh: historical-hash mismatch on an
    // actively-edited paper is the TAMPER-DETECTION PATHWAY WORKING AS
    // DESIGNED — receipts remain valid evidence of historical content.
    // Wilt is only when ALL anchors are gone. This test pins the
    // distinction.
    const result = derivePetalBloomState(baseEvidence({
      hasDraft: true,
      stubCount: 0,
      benchmarkTodoCount: 0,
      otsAnchored: true,
      baseAnchored: true,
      anchorMismatch: true,
    }));
    expect(result.state).toBe('full');
  });
});

describe('deriveLotusGenesisReadiness', () => {
  it('not ready when zero petals', () => {
    const result = deriveLotusGenesisReadiness(new Map());
    expect(result.ready).toBe(false);
    expect(result.fullPetals).toBe(0);
    expect(result.totalPetals).toBe(0);
  });

  it('not ready when one petal is sealed', () => {
    const evidence = new Map<string, PetalEvidence>([
      ['p1', baseEvidence({
        paperId: 'p1',
        hasDraft: true,
        otsAnchored: true,
        baseAnchored: true,
      })],
      ['p2', baseEvidence({ paperId: 'p2', hasDraft: false })],
    ]);
    const result = deriveLotusGenesisReadiness(evidence);
    expect(result.ready).toBe(false);
    expect(result.fullPetals).toBe(1);
    expect(result.totalPetals).toBe(2);
    expect(result.blockingPetals).toHaveLength(1);
    expect(result.blockingPetals[0].paperId).toBe('p2');
    expect(result.blockingPetals[0].state).toBe('sealed');
  });

  it('READY when all 16 petals are full (the I.007 trigger condition)', () => {
    // The actual condition the Lotus Genesis Trigger watches for. When this
    // returns ready=true, Brittney emits a `lotusGenesisReady` event.
    // Brittney never fires the genesis ceremony itself — that requires
    // Trezor confirmation per I.007.
    const sixteenFull = new Map<string, PetalEvidence>();
    for (let i = 1; i <= 16; i++) {
      sixteenFull.set(`paper-${i}`, baseEvidence({
        paperId: `paper-${i}`,
        hasDraft: true,
        stubCount: 0,
        benchmarkTodoCount: 0,
        otsAnchored: true,
        baseAnchored: true,
      }));
    }
    const result = deriveLotusGenesisReadiness(sixteenFull);
    expect(result.ready).toBe(true);
    expect(result.fullPetals).toBe(16);
    expect(result.totalPetals).toBe(16);
    expect(result.blockingPetals).toHaveLength(0);
  });

  it('not ready when even ONE petal is wilted (terminal block)', () => {
    // A wilted petal is NOT a partial credit case — it is a hard block on
    // Lotus Genesis. The trigger condition is unforgiving: every petal must
    // be full, no exceptions, no graceful degradation.
    const evidence = new Map<string, PetalEvidence>();
    for (let i = 1; i <= 15; i++) {
      evidence.set(`paper-${i}`, baseEvidence({
        paperId: `paper-${i}`,
        hasDraft: true,
        otsAnchored: true,
        baseAnchored: true,
      }));
    }
    evidence.set('paper-16', baseEvidence({
      paperId: 'paper-16',
      hasDraft: true,
      retracted: true,
    }));
    const result = deriveLotusGenesisReadiness(evidence);
    expect(result.ready).toBe(false);
    expect(result.fullPetals).toBe(15);
    expect(result.blockingPetals).toHaveLength(1);
    expect(result.blockingPetals[0].state).toBe('wilted');
  });
});
