import { createHash, generateKeyPairSync } from 'crypto';
import {
  COMPUTE_WORK_UNIT_COMPILER_VERSION,
  buildComputeWorkUnit,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import { describe, expect, it } from 'vitest';
import {
  COMPUTE_JOB_ADMISSION_MAX_TTL_MS,
  COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
  createComputeJobAdmissionEnvelope,
  prepareAndSignComputeJobAdmission,
  prepareComputeJobAdmission,
  signComputeJobAdmission,
  verifyComputeJobAdmission,
  type ComputeJobAdmissionEvidence,
  type ComputeJobAdmissionReceipt,
  type ComputeJobAdmissionTrustAnchor,
  type PrepareComputeJobAdmissionInput,
  type VerifyComputeJobAdmissionExpectedContext,
} from '../compute-job-admission';

const VERIFIED_AT = '2026-08-01T12:00:00.000Z';
const VALID_UNTIL = '2026-08-01T12:04:00.000Z';
const VERIFY_AT = '2026-08-01T12:01:00.000Z';
const TEAM_ID = 'team_compute_alpha';
const JOB_ID = 'job_compute_001';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const ISSUER = 'urn:holoscript:test:compute-admission';
const KEY_ID = 'compute-admission-test-key';

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = canonicalize(source[key]);
    return result;
  }
  throw new TypeError('unsupported test value');
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function contentAddress(value: unknown): string {
  return digest(canonicalJson(value));
}

const PRINCIPAL = digest('principal:compute-user');
const REQUEST = digest('request:queue');
const TRUST_POLICY = digest('trust-policy:enterprise-compute-v1');

function workUnit(dataClassification: 'public' | 'confidential' = 'confidential') {
  return buildComputeWorkUnit(
    {
      intent: 'Run a bounded authenticated GPU workload',
      allowed_accelerators: ['gpu'],
      placement_policy: 'external_bridge_requested',
      data_classification: dataClassification,
      quality_metric: 'max_abs_error',
      quality_operator: 'lte',
      quality_threshold: 0.00001,
      quality_reference: 'cpu_reference',
      deadline_ms: 60_000,
      budget_currency: 'USD',
      max_cost_minor_units: 100,
      allow_fallback: false,
    },
    {
      objectName: 'compute-admission-test',
      sourceDigest: 'a'.repeat(64),
      sourceDigestKind: 'source_utf8',
      compiler: 'ComputeWorkUnitCompiler',
      compilerVersion: COMPUTE_WORK_UNIT_COMPILER_VERSION,
    }
  );
}

function evidence(schemaVersion: string, marker: string): ComputeJobAdmissionEvidence {
  const body = {
    marker,
    schemaVersion,
    verificationScope: 'structural_only',
  };
  const receiptId = contentAddress(body);
  const receipt = { ...body, receiptId };
  return { receiptId, schemaVersion, bytes: canonicalJson(receipt) };
}

const EVIDENCE_A = evidence('holoscript.compute-capacity-snapshot.v1', 'capacity');
const EVIDENCE_B = evidence('holoscript.compute-placement-plan.v1', 'placement');

function prepareInput(
  overrides: Partial<PrepareComputeJobAdmissionInput> = {}
): PrepareComputeJobAdmissionInput {
  return {
    teamId: TEAM_ID,
    principalDigest: PRINCIPAL,
    jobId: JOB_ID,
    attempt: 1,
    operation: 'compute_job.queue',
    requestDigest: REQUEST,
    workUnit: workUnit(),
    evidence: [EVIDENCE_B, EVIDENCE_A],
    trustPolicyDigest: TRUST_POLICY,
    lifecycle: {
      kind: 'transition',
      expectedJobReceiptId: digest('job:expected'),
      nextJobReceiptId: digest('job:next'),
      transitionReceiptId: digest('transition:queue'),
    },
    verifiedAt: VERIFIED_AT,
    validUntil: VALID_UNTIL,
    issuer: ISSUER,
    keyId: KEY_ID,
    ...overrides,
  };
}

function expectedContext(
  input: PrepareComputeJobAdmissionInput
): VerifyComputeJobAdmissionExpectedContext {
  return {
    teamId: input.teamId,
    principalDigest: input.principalDigest,
    jobId: input.jobId,
    attempt: input.attempt,
    operation: input.operation,
    requestDigest: input.requestDigest,
    trustPolicyDigest: input.trustPolicyDigest,
    lifecycle: input.lifecycle,
  };
}

function trustAnchor(
  overrides: Partial<ComputeJobAdmissionTrustAnchor> = {}
): ComputeJobAdmissionTrustAnchor {
  return {
    schemaVersion: COMPUTE_JOB_ADMISSION_TRUST_ANCHOR_SCHEMA_VERSION,
    issuer: ISSUER,
    keyId: KEY_ID,
    algorithm: 'Ed25519',
    publicKey,
    allowedTeamIds: [TEAM_ID],
    allowedPrincipalDigests: [PRINCIPAL],
    allowedTrustPolicyDigests: [TRUST_POLICY],
    validFrom: '2026-08-01T11:00:00.000Z',
    validUntil: '2026-08-01T13:00:00.000Z',
    ...overrides,
  };
}

function signedReceipt(
  input: PrepareComputeJobAdmissionInput = prepareInput()
): ComputeJobAdmissionReceipt {
  return prepareAndSignComputeJobAdmission(input, { issuer: ISSUER, keyId: KEY_ID, privateKey });
}

function verifyReceipt(
  receipt: ComputeJobAdmissionReceipt,
  preparedInput: PrepareComputeJobAdmissionInput = prepareInput(),
  options: {
    evidence?: readonly ComputeJobAdmissionEvidence[];
    workUnit?: ComputeWorkUnitContract;
    anchors?: readonly ComputeJobAdmissionTrustAnchor[];
    at?: string;
    receiptBytes?: string;
  } = {}
) {
  const envelope = createComputeJobAdmissionEnvelope(receipt);
  return verifyComputeJobAdmission({
    receipt,
    receiptBytes: options.receiptBytes ?? envelope.bytes,
    evidence: options.evidence ?? preparedInput.evidence,
    workUnit: options.workUnit ?? preparedInput.workUnit,
    expected: expectedContext(preparedInput),
    trustAnchors: options.anchors ?? [trustAnchor()],
    at: options.at ?? VERIFY_AT,
  });
}

describe('compute job admission receipts', () => {
  it('prepares, content-addresses, signs, and verifies exact durable admission bytes', () => {
    const input = prepareInput();
    const prepared = prepareComputeJobAdmission(input);
    expect(prepared.evidenceBindings.map((binding) => binding.receiptId)).toEqual(
      [EVIDENCE_A.receiptId, EVIDENCE_B.receiptId].sort()
    );
    expect(prepared.receiptId).toMatch(/^sha256:[a-f0-9]{64}$/);

    const receipt = signComputeJobAdmission(prepared, {
      issuer: ISSUER,
      keyId: KEY_ID,
      privateKey,
    });
    const envelope = createComputeJobAdmissionEnvelope(receipt);
    expect(envelope.bytes).toBe(canonicalJson(receipt));

    const result = verifyReceipt(receipt, input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.canonicalReceiptBytes).toBe(envelope.bytes);
    expect(result.verification).toEqual({
      scope: 'authenticated_admission_only',
      admissionAuthenticated: true,
      providerReservationVerified: false,
      executionVerified: false,
    });
    expect(result.receipt.providerReservation).toBe('not_proven');
    expect(result.receipt.execution).toBe('not_proven');
  });

  it('rejects altered, noncanonical, or duplicated exact evidence bytes', () => {
    const input = prepareInput();
    const receipt = signedReceipt(input);

    const alteredBytes = [{ ...EVIDENCE_A, bytes: `${EVIDENCE_A.bytes}\n` }, EVIDENCE_B];
    const alteredResult = verifyReceipt(receipt, input, { evidence: alteredBytes });
    expect(alteredResult.valid).toBe(false);
    if (!alteredResult.valid) expect(alteredResult.reasonCodes).toContain('evidence_invalid');

    const duplicateResult = verifyReceipt(receipt, input, {
      evidence: [EVIDENCE_A, EVIDENCE_A],
    });
    expect(duplicateResult.valid).toBe(false);
    if (!duplicateResult.valid) expect(duplicateResult.reasonCodes).toContain('evidence_invalid');

    const replacement = evidence('holoscript.compute-placement-plan.v1', 'other-placement');
    const replacementResult = verifyReceipt(receipt, input, {
      evidence: [EVIDENCE_A, replacement],
    });
    expect(replacementResult.valid).toBe(false);
    if (!replacementResult.valid) {
      expect(replacementResult.reasonCodes).toContain('evidence_bytes_mismatch');
    }
  });

  it.each([
    {
      name: 'team',
      input: prepareInput({ teamId: 'team_compute_other' }),
      reason: 'team_not_allowed' as const,
    },
    {
      name: 'principal',
      input: prepareInput({ principalDigest: digest('principal:other') }),
      reason: 'principal_not_allowed' as const,
    },
    {
      name: 'trust policy',
      input: prepareInput({ trustPolicyDigest: digest('trust-policy:other') }),
      reason: 'trust_policy_not_allowed' as const,
    },
  ])('rejects a correctly signed but non-allowlisted $name', ({ input, reason }) => {
    const result = verifyReceipt(signedReceipt(input), input);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasonCodes).toContain(reason);
  });

  it('rejects expired and revoked anchors at both required trust instants', () => {
    const input = prepareInput();
    const receipt = signedReceipt(input);

    const expiredAnchor = trustAnchor({ validUntil: '2026-08-01T12:00:30.000Z' });
    const expiredResult = verifyReceipt(receipt, input, { anchors: [expiredAnchor] });
    expect(expiredResult.valid).toBe(false);
    if (!expiredResult.valid) {
      expect(expiredResult.reasonCodes).toContain('anchor_not_current_at_verification');
      expect(expiredResult.reasonCodes).not.toContain('anchor_not_current_at_admission');
    }

    const revokedAnchor = trustAnchor({ revokedAt: '2026-08-01T12:00:30.000Z' });
    const revokedResult = verifyReceipt(receipt, input, { anchors: [revokedAnchor] });
    expect(revokedResult.valid).toBe(false);
    if (!revokedResult.valid) {
      expect(revokedResult.reasonCodes).toContain('anchor_revoked_at_verification');
      expect(revokedResult.reasonCodes).not.toContain('anchor_revoked_at_admission');
    }
  });

  it('rejects an admission at its half-open expiry boundary', () => {
    const input = prepareInput();
    const result = verifyReceipt(signedReceipt(input), input, { at: VALID_UNTIL });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasonCodes).toContain('admission_expired');
  });

  it('rejects duplicate and noncanonical evidence bindings in the signed envelope', () => {
    const input = prepareInput();
    const receipt = signedReceipt(input);
    const reversed = {
      ...receipt,
      evidenceBindings: [...receipt.evidenceBindings].reverse(),
    };
    const reversedResult = verifyComputeJobAdmission({
      receipt: reversed,
      evidence: input.evidence,
      workUnit: input.workUnit,
      expected: expectedContext(input),
      trustAnchors: [trustAnchor()],
      at: VERIFY_AT,
    });
    expect(reversedResult.valid).toBe(false);
    if (!reversedResult.valid) {
      expect(reversedResult.reasonCodes).toContain('evidence_bindings_noncanonical');
    }

    const duplicate = {
      ...receipt,
      evidenceBindings: [receipt.evidenceBindings[0], receipt.evidenceBindings[0]],
    };
    const duplicateResult = verifyComputeJobAdmission({
      receipt: duplicate,
      evidence: input.evidence,
      workUnit: input.workUnit,
      expected: expectedContext(input),
      trustAnchors: [trustAnchor()],
      at: VERIFY_AT,
    });
    expect(duplicateResult.valid).toBe(false);
    if (!duplicateResult.valid) {
      expect(duplicateResult.reasonCodes).toContain('evidence_bindings_noncanonical');
    }
  });

  it('rejects altered receipt and lifecycle IDs plus altered signatures', () => {
    const input = prepareInput();
    const receipt = signedReceipt(input);
    const receiptIdResult = verifyComputeJobAdmission({
      receipt: { ...receipt, receiptId: digest('receipt:altered') },
      evidence: input.evidence,
      workUnit: input.workUnit,
      expected: expectedContext(input),
      trustAnchors: [trustAnchor()],
      at: VERIFY_AT,
    });
    expect(receiptIdResult.valid).toBe(false);
    if (!receiptIdResult.valid) {
      expect(receiptIdResult.reasonCodes).toContain('receipt_content_address_invalid');
      expect(receiptIdResult.reasonCodes).toContain('receipt_signature_invalid');
    }

    if (receipt.lifecycle.kind !== 'transition') throw new Error('fixture must be a transition');
    const lifecycleResult = verifyComputeJobAdmission({
      receipt: {
        ...receipt,
        lifecycle: { ...receipt.lifecycle, transitionReceiptId: digest('transition:altered') },
      },
      evidence: input.evidence,
      workUnit: input.workUnit,
      expected: expectedContext(input),
      trustAnchors: [trustAnchor()],
      at: VERIFY_AT,
    });
    expect(lifecycleResult.valid).toBe(false);
    if (!lifecycleResult.valid) {
      expect(lifecycleResult.reasonCodes).toContain('context_mismatch');
      expect(lifecycleResult.reasonCodes).toContain('receipt_signature_invalid');
    }

    const signatureBytes = Buffer.from(receipt.signatureBase64, 'base64');
    signatureBytes[0] ^= 1;
    const signatureResult = verifyComputeJobAdmission({
      receipt: { ...receipt, signatureBase64: signatureBytes.toString('base64') },
      evidence: input.evidence,
      workUnit: input.workUnit,
      expected: expectedContext(input),
      trustAnchors: [trustAnchor()],
      at: VERIFY_AT,
    });
    expect(signatureResult.valid).toBe(false);
    if (!signatureResult.valid) {
      expect(signatureResult.reasonCodes).toContain('receipt_signature_invalid');
    }
  });

  it('rejects a future verifiedAt even when its TTL and signature are valid', () => {
    const input = prepareInput({
      verifiedAt: '2026-08-01T12:02:00.000Z',
      validUntil: '2026-08-01T12:04:00.000Z',
    });
    const result = verifyReceipt(signedReceipt(input), input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reasonCodes).toContain('admission_verified_at_future');
    }
  });

  it('rejects unknown, ambiguous, malformed, and noncanonical trust anchors', () => {
    const input = prepareInput();
    const receipt = signedReceipt(input);
    const unknownResult = verifyReceipt(receipt, input, { anchors: [] });
    expect(unknownResult.valid).toBe(false);
    if (!unknownResult.valid) expect(unknownResult.reasonCodes).toContain('unknown_key');

    const ambiguousResult = verifyReceipt(receipt, input, {
      anchors: [trustAnchor(), trustAnchor()],
    });
    expect(ambiguousResult.valid).toBe(false);
    if (!ambiguousResult.valid) expect(ambiguousResult.reasonCodes).toContain('ambiguous_key');

    const malformed = trustAnchor({ allowedTeamIds: ['z-team', TEAM_ID] });
    const malformedResult = verifyReceipt(receipt, input, { anchors: [malformed] });
    expect(malformedResult.valid).toBe(false);
    if (!malformedResult.valid) {
      expect(malformedResult.reasonCodes).toContain('trust_anchor_invalid');
    }
  });

  it('rejects a different WorkUnit and a noncanonical durable receipt byte envelope', () => {
    const input = prepareInput();
    const receipt = signedReceipt(input);
    const workUnitResult = verifyReceipt(receipt, input, { workUnit: workUnit('public') });
    expect(workUnitResult.valid).toBe(false);
    if (!workUnitResult.valid) {
      expect(workUnitResult.reasonCodes).toContain('work_unit_mismatch');
    }

    const bytesResult = verifyReceipt(receipt, input, {
      receiptBytes: JSON.stringify(receipt, null, 2),
    });
    expect(bytesResult.valid).toBe(false);
    if (!bytesResult.valid) {
      expect(bytesResult.reasonCodes).toContain('receipt_bytes_mismatch');
    }
  });

  it('fails preparation on noncanonical timestamps, excessive TTL, or lifecycle mismatch', () => {
    expect(() =>
      prepareComputeJobAdmission(prepareInput({ verifiedAt: '2026-08-01T12:00:00Z' }))
    ).toThrow(/validity window/);
    expect(() =>
      prepareComputeJobAdmission(
        prepareInput({
          validUntil: new Date(
            Date.parse(VERIFIED_AT) + COMPUTE_JOB_ADMISSION_MAX_TTL_MS + 1
          ).toISOString(),
        })
      )
    ).toThrow(/validity window/);
    expect(() =>
      prepareComputeJobAdmission(
        prepareInput({
          operation: 'compute_job.create',
          lifecycle: prepareInput().lifecycle,
        })
      )
    ).toThrow(/lifecycle/);
  });
});
