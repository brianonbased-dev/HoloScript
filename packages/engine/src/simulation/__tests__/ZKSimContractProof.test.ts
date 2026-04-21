/**
 * ZKSimContractProof — Tests (paper-1/capstone §ZK prototype)
 *
 * Test groups:
 *   A. commitGeometry — creates valid commitment
 *   B. openCommitment — round-trip opening works
 *   C. generateComplianceProof — proof construction
 *   D. verifyZKCompliance — all 8 verifier checks
 *   E. end-to-end prove → verify flow
 *   F. cross-hash-mode (fnv1a vs sha256 produce different commits)
 */

import { describe, it, expect } from 'vitest';
import {
  commitGeometry,
  openCommitment,
  generateComplianceProof,
  verifyZKCompliance,
  type ZKGeometryCommitment,
  type ZKComplianceProof,
} from '../ZKSimContractProof';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_GEO_HASH = 'abc123deadbeef0000000000000000001234567890abcdef';
const FIXED_DT = 0.01;
const SOLVER_TYPE = 'TET4TestSolver';
const RUN_ID = 'run-test-001';
const FAKE_DIGESTS = ['digest_step0', 'digest_step1', 'digest_step2'];

function makeProof(overrides: Partial<ZKComplianceProof> = {}): ZKComplianceProof {
  const commitment = commitGeometry(FAKE_GEO_HASH, 'fixedsalt');
  return generateComplianceProof({
    commitment: commitment.commitment,
    runId: RUN_ID,
    solverType: SOLVER_TYPE,
    fixedDt: FIXED_DT,
    stepCount: FAKE_DIGESTS.length,
    stateDigests: FAKE_DIGESTS,
    ...overrides,
  });
}

// ── A. commitGeometry ─────────────────────────────────────────────────────────

describe('A. commitGeometry', () => {
  it('produces a non-empty commitment string', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'salt1');
    expect(c.commitment).toBeTruthy();
    expect(c.commitment.length).toBeGreaterThanOrEqual(8);
  });

  it('stores geometryHashPreimage and salt', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'testsalt');
    expect(c.geometryHashPreimage).toBe(FAKE_GEO_HASH);
    expect(c.salt).toBe('testsalt');
  });

  it('same inputs produce same commitment (deterministic)', () => {
    const c1 = commitGeometry(FAKE_GEO_HASH, 'salt');
    const c2 = commitGeometry(FAKE_GEO_HASH, 'salt');
    expect(c1.commitment).toBe(c2.commitment);
  });

  it('different salts produce different commitments (hiding)', () => {
    const c1 = commitGeometry(FAKE_GEO_HASH, 'salt1');
    const c2 = commitGeometry(FAKE_GEO_HASH, 'salt2');
    expect(c1.commitment).not.toBe(c2.commitment);
  });

  it('different geometryHashes produce different commitments', () => {
    const c1 = commitGeometry(FAKE_GEO_HASH, 'salt');
    const c2 = commitGeometry(FAKE_GEO_HASH + 'X', 'salt');
    expect(c1.commitment).not.toBe(c2.commitment);
  });

  it('throws on empty geometryHash', () => {
    expect(() => commitGeometry('', 'salt')).toThrow('commitGeometry: geometryHash must be non-empty');
  });

  it('generates a salt when not provided (non-empty)', () => {
    const c = commitGeometry(FAKE_GEO_HASH);
    expect(c.salt).toBeTruthy();
    expect(c.salt.length).toBeGreaterThan(0);
  });
});

// ── B. openCommitment ─────────────────────────────────────────────────────────

describe('B. openCommitment', () => {
  it('returns true when geometry and salt match the commitment', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'opensalt');
    expect(openCommitment(c.commitment, FAKE_GEO_HASH, 'opensalt')).toBe(true);
  });

  it('returns false when the geometryHash has been tampered', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'opensalt');
    expect(openCommitment(c.commitment, FAKE_GEO_HASH + '1', 'opensalt')).toBe(false);
  });

  it('returns false when salt has been tampered', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'opensalt');
    expect(openCommitment(c.commitment, FAKE_GEO_HASH, 'wrongsalt')).toBe(false);
  });

  it('round-trip: commitGeometry → openCommitment with stored preimage and salt', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'roundtripsalt');
    expect(openCommitment(c.commitment, c.geometryHashPreimage, c.salt)).toBe(true);
  });
});

// ── C. generateComplianceProof ────────────────────────────────────────────────

describe('C. generateComplianceProof', () => {
  it('creates proof with provided fields', () => {
    const proof = makeProof();
    expect(proof.solverType).toBe(SOLVER_TYPE);
    expect(proof.fixedDt).toBe(FIXED_DT);
    expect(proof.stepCount).toBe(FAKE_DIGESTS.length);
    expect(proof.stateDigests).toEqual(FAKE_DIGESTS);
    expect(proof.runId).toBe(RUN_ID);
  });

  it('timestamp is close to now', () => {
    const before = Date.now();
    const proof = makeProof();
    const after = Date.now();
    expect(proof.timestamp).toBeGreaterThanOrEqual(before);
    expect(proof.timestamp).toBeLessThanOrEqual(after);
  });

  it('gpuOutputDigests defaults to empty array', () => {
    const proof = makeProof();
    expect(proof.gpuOutputDigests).toEqual([]);
  });

  it('gpuOutputDigests is included when provided', () => {
    const gpuDigests = ['gpu_step0', 'gpu_step1', 'gpu_step2'];
    const proof = makeProof({ gpuOutputDigests: gpuDigests });
    expect(proof.gpuOutputDigests).toEqual(gpuDigests);
  });

  it('default complianceClaim includes stepCount', () => {
    const proof = makeProof();
    expect(proof.complianceClaim).toContain('3');
  });

  it('custom complianceClaim is preserved', () => {
    const proof = makeProof({ complianceClaim: 'custom claim XYZ' });
    expect(proof.complianceClaim).toBe('custom claim XYZ');
  });
});

// ── D. verifyZKCompliance — check V1-V8 ───────────────────────────────────────

describe('D. verifyZKCompliance — V1 commitment well-formed', () => {
  it('valid proof passes V1', () => {
    const result = verifyZKCompliance(makeProof());
    expect(result.violations.some((v) => v.startsWith('V1'))).toBe(false);
  });

  it('empty commitment fails V1', () => {
    const result = verifyZKCompliance(makeProof({ commitment: '' }));
    expect(result.violations.some((v) => v.startsWith('V1'))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('very short commitment fails V1', () => {
    const result = verifyZKCompliance(makeProof({ commitment: 'abc' }));
    expect(result.violations.some((v) => v.startsWith('V1'))).toBe(true);
  });
});

describe('D. verifyZKCompliance — V2 stepCount matches digests', () => {
  it('mismatched stepCount fails V2', () => {
    const result = verifyZKCompliance(makeProof({ stepCount: 10 }));
    expect(result.violations.some((v) => v.startsWith('V2'))).toBe(true);
    expect(result.valid).toBe(false);
  });
});

describe('D. verifyZKCompliance — V3 stepCount > 0', () => {
  it('zero stepCount fails V3', () => {
    const result = verifyZKCompliance(makeProof({ stepCount: 0, stateDigests: [] }));
    expect(result.violations.some((v) => v.startsWith('V3'))).toBe(true);
    expect(result.valid).toBe(false);
  });
});

describe('D. verifyZKCompliance — V4 digests non-empty', () => {
  it('empty string in digests fails V4', () => {
    const result = verifyZKCompliance(
      makeProof({ stateDigests: ['ok', '', 'ok'], stepCount: 3 }),
    );
    expect(result.violations.some((v) => v.startsWith('V4'))).toBe(true);
    expect(result.valid).toBe(false);
  });
});

describe('D. verifyZKCompliance — V5 no frozen consecutive steps', () => {
  it('repeated consecutive digest fails V5', () => {
    const result = verifyZKCompliance(
      makeProof({ stateDigests: ['digest_a', 'digest_a', 'digest_b'], stepCount: 3 }),
    );
    expect(result.violations.some((v) => v.startsWith('V5'))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('same digest non-consecutively is fine', () => {
    const result = verifyZKCompliance(
      makeProof({ stateDigests: ['digest_a', 'digest_b', 'digest_a'], stepCount: 3 }),
    );
    expect(result.violations.some((v) => v.startsWith('V5'))).toBe(false);
  });
});

describe('D. verifyZKCompliance — V6 fixedDt valid', () => {
  it('zero fixedDt fails V6', () => {
    const result = verifyZKCompliance(makeProof({ fixedDt: 0 }));
    expect(result.violations.some((v) => v.startsWith('V6'))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('negative fixedDt fails V6', () => {
    const result = verifyZKCompliance(makeProof({ fixedDt: -0.01 }));
    expect(result.violations.some((v) => v.startsWith('V6'))).toBe(true);
  });
});

describe('D. verifyZKCompliance — V7 timestamp not in future', () => {
  it('future timestamp fails V7', () => {
    const result = verifyZKCompliance(
      makeProof({ timestamp: Date.now() + 120_000 }),
      { clockToleranceMs: 1_000 },
    );
    expect(result.violations.some((v) => v.startsWith('V7'))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('past timestamp is fine', () => {
    const result = verifyZKCompliance(makeProof({ timestamp: Date.now() - 5_000 }));
    expect(result.violations.some((v) => v.startsWith('V7'))).toBe(false);
  });
});

describe('D. verifyZKCompliance — V8 GPU digests count', () => {
  it('GPU digest count mismatch fails V8', () => {
    const result = verifyZKCompliance(
      makeProof({ gpuOutputDigests: ['gpu_a', 'gpu_b'], stepCount: 3, stateDigests: FAKE_DIGESTS }),
    );
    expect(result.violations.some((v) => v.startsWith('V8'))).toBe(true);
    expect(result.valid).toBe(false);
  });

  it('matching GPU digest count passes V8', () => {
    const gpuDigests = ['gpu_0', 'gpu_1', 'gpu_2'];
    const result = verifyZKCompliance(
      makeProof({
        gpuOutputDigests: gpuDigests,
        stepCount: 3,
        stateDigests: FAKE_DIGESTS,
      }),
    );
    expect(result.violations.some((v) => v.startsWith('V8'))).toBe(false);
  });
});

// ── E. End-to-end ─────────────────────────────────────────────────────────────

describe('E. end-to-end prove → verify', () => {
  it('valid proof from scratch verifies successfully', () => {
    const commitment = commitGeometry(FAKE_GEO_HASH, 'e2e-salt');
    const proof = generateComplianceProof({
      commitment: commitment.commitment,
      runId: 'run-e2e',
      solverType: 'E2ESolver',
      fixedDt: 0.005,
      stepCount: 5,
      stateDigests: ['d0', 'd1', 'd2', 'd3', 'd4'],
    });
    const result = verifyZKCompliance(proof);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('verifier cannot learn raw geometry from proof fields', () => {
    const commitment = commitGeometry(FAKE_GEO_HASH, 'hidden-salt');
    const proof = generateComplianceProof({
      commitment: commitment.commitment,
      runId: 'run-privacy',
      solverType: 'PrivacySolver',
      fixedDt: 0.01,
      stepCount: 2,
      stateDigests: ['s0', 's1'],
    });
    // The proof object must not contain raw geometry or salt
    expect(JSON.stringify(proof)).not.toContain(FAKE_GEO_HASH);
    expect(JSON.stringify(proof)).not.toContain('hidden-salt');
    // But opening requires them
    expect(openCommitment(commitment.commitment, FAKE_GEO_HASH, 'hidden-salt')).toBe(true);
    expect(openCommitment(commitment.commitment, FAKE_GEO_HASH, 'wrong-salt')).toBe(false);
  });

  it('result notes contain solver info on success', () => {
    const proof = makeProof();
    const result = verifyZKCompliance(proof);
    expect(result.valid).toBe(true);
    expect(result.notes[0]).toContain(SOLVER_TYPE);
  });
});

// ── F. Cross-hash-mode ────────────────────────────────────────────────────────

describe('F. cross-hash-mode', () => {
  it('fnv1a and sha256 modes produce different commitments', () => {
    const c1 = commitGeometry(FAKE_GEO_HASH, 'samesalt', 'fnv1a');
    const c2 = commitGeometry(FAKE_GEO_HASH, 'samesalt', 'sha256');
    expect(c1.commitment).not.toBe(c2.commitment);
  });

  it('sha256 commitment is longer than fnv1a (64 vs 8 hex chars)', () => {
    const c1 = commitGeometry(FAKE_GEO_HASH, 'samesalt', 'fnv1a');
    const c2 = commitGeometry(FAKE_GEO_HASH, 'samesalt', 'sha256');
    expect(c2.commitment.length).toBeGreaterThan(c1.commitment.length);
  });

  it('openCommitment fails when hash mode changes', () => {
    const c = commitGeometry(FAKE_GEO_HASH, 'modetest', 'sha256');
    // Opening with wrong mode should not match
    expect(openCommitment(c.commitment, FAKE_GEO_HASH, 'modetest', 'fnv1a')).toBe(false);
    expect(openCommitment(c.commitment, FAKE_GEO_HASH, 'modetest', 'sha256')).toBe(true);
  });
});
