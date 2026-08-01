import { generateKeyPairSync, sign } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION,
  buildComputeBudgetEvidence,
  validateComputeBudgetEvidence,
  verifyComputeBudgetEvidence,
  type BuildComputeBudgetEvidenceInput,
  type ComputeBudgetEvidenceStatus,
  type ComputeEvidenceSigner,
  type ComputeEvidenceTrustAnchor,
} from '../ComputePlacementEvidence';

const TEAM_ID = 'team-enterprise-a';
const BUDGET_RAIL_ID = 'gpu-managed-usd';
const PRINCIPAL_DIGEST = `sha256:${'a'.repeat(64)}`;
const JOB_ID = `sha256:${'b'.repeat(64)}`;
const WORK_UNIT_DIGEST = `sha256:${'c'.repeat(64)}`;
const POLICY_DIGEST = `sha256:${'d'.repeat(64)}`;
const PERIOD_DIGEST = `sha256:${'e'.repeat(64)}`;
const NONCE_DIGEST = `sha256:${'f'.repeat(64)}`;
const IDEMPOTENCY_KEY_HASH = `sha256:${'1'.repeat(64)}`;
const MEASURED_COST_RECEIPT_ID = `sha256:${'2'.repeat(64)}`;
const ISSUED_AT = '2026-08-01T12:00:00.000Z';
const VALID_FROM = '2026-08-01T00:00:00.000Z';
const VALID_UNTIL = '2026-08-02T00:00:00.000Z';

function authority(
  label: string,
  identity: { issuer?: string; keyId?: string } = {}
): { signer: ComputeEvidenceSigner; anchor: ComputeEvidenceTrustAnchor } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const issuer = identity.issuer ?? `urn:holoscript:test:${label}`;
  const keyId = identity.keyId ?? `${label}-key-1`;
  return {
    signer: {
      issuer,
      keyId,
      sign: (message) => sign(null, Buffer.from(message), privateKey).toString('base64'),
    },
    anchor: {
      issuer,
      keyId,
      algorithm: 'ed25519',
      roles: ['budget_ledger_attestor'],
      principalDigests: [PRINCIPAL_DIGEST],
      teamIds: [TEAM_ID],
      budgetRailIds: [BUDGET_RAIL_ID],
      validFrom: VALID_FROM,
      validUntil: VALID_UNTIL,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
  };
}

const trusted = authority('trusted');

function input(
  status: ComputeBudgetEvidenceStatus = 'held',
  overrides: Partial<BuildComputeBudgetEvidenceInput> = {}
): BuildComputeBudgetEvidenceInput {
  const states: Record<
    ComputeBudgetEvidenceStatus,
    Pick<
      BuildComputeBudgetEvidenceInput,
      | 'maxAmountMinorUnits'
      | 'heldAmountMinorUnits'
      | 'settledAmountMinorUnits'
      | 'accountBefore'
      | 'accountAfter'
      | 'measuredCostReceiptId'
    >
  > = {
    authorized: {
      maxAmountMinorUnits: 500,
      heldAmountMinorUnits: 0,
      settledAmountMinorUnits: 0,
      accountBefore: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
      accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
    },
    held: {
      maxAmountMinorUnits: 500,
      heldAmountMinorUnits: 500,
      settledAmountMinorUnits: 0,
      accountBefore: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
      accountAfter: { heldAmountMinorUnits: 600, settledAmountMinorUnits: 25, version: 5 },
    },
    released: {
      maxAmountMinorUnits: 500,
      heldAmountMinorUnits: 0,
      settledAmountMinorUnits: 0,
      accountBefore: { heldAmountMinorUnits: 600, settledAmountMinorUnits: 25, version: 4 },
      accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 5 },
    },
    settled: {
      maxAmountMinorUnits: 500,
      heldAmountMinorUnits: 0,
      settledAmountMinorUnits: 350,
      accountBefore: { heldAmountMinorUnits: 600, settledAmountMinorUnits: 25, version: 4 },
      accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 375, version: 5 },
      measuredCostReceiptId: MEASURED_COST_RECEIPT_ID,
    },
    rejected: {
      maxAmountMinorUnits: 500,
      heldAmountMinorUnits: 0,
      settledAmountMinorUnits: 0,
      accountBefore: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
      accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
    },
  };

  return {
    teamId: TEAM_ID,
    budgetRailId: BUDGET_RAIL_ID,
    principalDigest: PRINCIPAL_DIGEST,
    jobId: JOB_ID,
    attempt: 1,
    workUnitDigest: WORK_UNIT_DIGEST,
    currency: 'USD',
    status,
    ...states[status],
    policyDigest: POLICY_DIGEST,
    periodDigest: PERIOD_DIGEST,
    nonceDigest: NONCE_DIGEST,
    idempotencyKeyHash: IDEMPOTENCY_KEY_HASH,
    issuedAt: ISSUED_AT,
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
    signer: trusted.signer,
    ...overrides,
  };
}

function expectedBinding() {
  return {
    teamId: TEAM_ID,
    budgetRailId: BUDGET_RAIL_ID,
    principalDigest: PRINCIPAL_DIGEST,
    jobId: JOB_ID,
    attempt: 1,
    workUnitDigest: WORK_UNIT_DIGEST,
    currency: 'USD' as const,
    maxAmountMinorUnits: 500,
    policyDigest: POLICY_DIGEST,
    periodDigest: PERIOD_DIGEST,
    nonceDigest: NONCE_DIGEST,
    idempotencyKeyHash: IDEMPOTENCY_KEY_HASH,
  };
}

describe('ComputeBudgetEvidence', () => {
  it.each<ComputeBudgetEvidenceStatus>(['authorized', 'held', 'released', 'settled', 'rejected'])(
    'builds deterministic signed %s ledger evidence',
    (status) => {
      const evidence = buildComputeBudgetEvidence(input(status));

      expect(evidence.schemaVersion).toBe(COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION);
      expect(evidence.verificationScope).toBe('issuer_attested');
      expect(evidence.evidenceScope).toBe('budget_ledger_only');
      expect(evidence.receiptId).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(validateComputeBudgetEvidence(evidence)).toEqual({ valid: true, errors: [] });
      expect(buildComputeBudgetEvidence(input(status)).receiptId).toBe(evidence.receiptId);
    }
  );

  it('cryptographically verifies signer provenance, trust scope, validity, and expected bindings', () => {
    const evidence = buildComputeBudgetEvidence(input('held'));

    expect(
      verifyComputeBudgetEvidence({
        evidence,
        ...expectedBinding(),
        verifiedAt: ISSUED_AT,
        trustAnchors: [trusted.anchor],
      })
    ).toEqual({ valid: true, errors: [], verificationScope: 'issuer_authenticated' });

    expect(
      verifyComputeBudgetEvidence({
        evidence,
        ...expectedBinding(),
        jobId: `sha256:${'9'.repeat(64)}`,
        verifiedAt: ISSUED_AT,
        trustAnchors: [trusted.anchor],
      }).errors
    ).toContain('budget evidence does not bind the expected jobId');
  });

  it('rejects field mutation and a forged signature even when issuer and key id are copied', () => {
    const evidence = buildComputeBudgetEvidence(input('held'));
    const mutated = { ...evidence, heldAmountMinorUnits: 499 };
    expect(validateComputeBudgetEvidence(mutated).errors).toEqual(
      expect.arrayContaining([
        'held evidence must hold exactly maxAmountMinorUnits',
        'budgetEvidence.receiptId does not match canonical body',
        'budgetEvidence.attestation.claimsDigest does not match the canonical claims',
      ])
    );

    const forged = authority('forged', {
      issuer: trusted.signer.issuer,
      keyId: trusted.signer.keyId,
    });
    const forgedEvidence = buildComputeBudgetEvidence(input('held', { signer: forged.signer }));
    expect(
      verifyComputeBudgetEvidence({
        evidence: forgedEvidence,
        ...expectedBinding(),
        verifiedAt: ISSUED_AT,
        trustAnchors: [trusted.anchor],
      }).errors
    ).toContain('budget_ledger_attestor signature is invalid');
  });

  it('rejects expired use and invalid issuance intervals', () => {
    const evidence = buildComputeBudgetEvidence(input('held'));
    expect(
      verifyComputeBudgetEvidence({
        evidence,
        ...expectedBinding(),
        verifiedAt: VALID_UNTIL,
        trustAnchors: [trusted.anchor],
      }).errors
    ).toContain('budget evidence is not active at verification time');

    expect(() =>
      buildComputeBudgetEvidence(
        input('held', {
          issuedAt: '2026-08-02T00:00:00.000Z',
        })
      )
    ).toThrow('issuedAt must fall within the validity interval');
  });

  it('requires USD safe-integer amounts and exact status-specific account projections', () => {
    expect(() =>
      buildComputeBudgetEvidence(input('held', { currency: 'EUR' as unknown as 'USD' }))
    ).toThrow('currency must be USD');
    expect(() =>
      buildComputeBudgetEvidence(
        input('held', { maxAmountMinorUnits: Number.MAX_SAFE_INTEGER + 1 })
      )
    ).toThrow('maxAmountMinorUnits must be a non-negative safe integer');
    expect(() => buildComputeBudgetEvidence(input('held', { heldAmountMinorUnits: 499 }))).toThrow(
      'held evidence must hold exactly maxAmountMinorUnits'
    );
    expect(() =>
      buildComputeBudgetEvidence(input('settled', { settledAmountMinorUnits: 501 }))
    ).toThrow('settledAmountMinorUnits must not exceed maxAmountMinorUnits');
    expect(() =>
      buildComputeBudgetEvidence(
        input('released', {
          accountAfter: { heldAmountMinorUnits: 101, settledAmountMinorUnits: 25, version: 5 },
        })
      )
    ).toThrow('released evidence accountAfter.heldAmountMinorUnits must release the exact hold');
  });

  it('requires measured-cost binding for every settlement, including measured zero', () => {
    expect(() =>
      buildComputeBudgetEvidence(input('settled', { measuredCostReceiptId: undefined }))
    ).toThrow('settled evidence requires measuredCostReceiptId');

    expect(() =>
      buildComputeBudgetEvidence(
        input('settled', {
          maxAmountMinorUnits: 0,
          settledAmountMinorUnits: 0,
          accountBefore: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
          accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 5 },
          measuredCostReceiptId: undefined,
        })
      )
    ).toThrow('settled evidence requires measuredCostReceiptId');

    expect(() =>
      buildComputeBudgetEvidence(
        input('settled', {
          maxAmountMinorUnits: 0,
          settledAmountMinorUnits: 0,
          accountBefore: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 4 },
          accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 5 },
          measuredCostReceiptId: MEASURED_COST_RECEIPT_ID,
        })
      )
    ).toThrow('settled evidence requires a positive maxAmountMinorUnits hold');

    const measuredZero = buildComputeBudgetEvidence(
      input('settled', {
        settledAmountMinorUnits: 0,
        accountAfter: { heldAmountMinorUnits: 100, settledAmountMinorUnits: 25, version: 5 },
      })
    );
    expect(validateComputeBudgetEvidence(measuredZero)).toEqual({ valid: true, errors: [] });

    const zeroCostAuthorization = buildComputeBudgetEvidence(
      input('authorized', { maxAmountMinorUnits: 0 })
    );
    expect(validateComputeBudgetEvidence(zeroCostAuthorization)).toEqual({
      valid: true,
      errors: [],
    });

    expect(() =>
      buildComputeBudgetEvidence(
        input('released', { measuredCostReceiptId: MEASURED_COST_RECEIPT_ID })
      )
    ).toThrow('measuredCostReceiptId is only allowed for settled evidence');
  });

  it('fails closed on team, rail, principal, policy, nonce, and idempotency trust drift', () => {
    const evidence = buildComputeBudgetEvidence(input('held'));
    expect(
      verifyComputeBudgetEvidence({
        evidence,
        ...expectedBinding(),
        verifiedAt: ISSUED_AT,
        trustAnchors: [{ ...trusted.anchor, teamIds: ['team-other'] }],
      }).errors
    ).toContain('trust anchor does not admit the bound team');

    expect(() =>
      buildComputeBudgetEvidence(input('held', { policyDigest: 'policy-current' }))
    ).toThrow('policyDigest must be a sha256 label');
    expect(() =>
      buildComputeBudgetEvidence(input('held', { nonceDigest: 'plaintext-nonce' }))
    ).toThrow('nonceDigest must be a sha256 label');
    expect(() =>
      buildComputeBudgetEvidence(input('held', { idempotencyKeyHash: 'plaintext-key' }))
    ).toThrow('idempotencyKeyHash must be a sha256 label');
  });

  it('rejects portable claims of provider reservation, execution, or payment', () => {
    const evidence = buildComputeBudgetEvidence(input('held'));
    const polluted = {
      ...evidence,
      providerReservationId: 'provider-slot-1',
      executionId: 'executor-1',
      paymentTransactionId: 'payment-1',
    };

    expect(validateComputeBudgetEvidence(polluted).errors).toEqual(
      expect.arrayContaining([
        'budgetEvidence.providerReservationId is not allowed',
        'budgetEvidence.executionId is not allowed',
        'budgetEvidence.paymentTransactionId is not allowed',
      ])
    );
  });
});
