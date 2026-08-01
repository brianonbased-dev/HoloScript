/**
 * Built-package declaration canary for signed compute budget evidence.
 *
 * This imports the published world-model subpath so a source-only export cannot
 * hide drift in the hand-generated declaration surface.
 */

import {
  COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION,
  buildComputeBudgetEvidence,
  validateComputeBudgetEvidence,
  verifyComputeBudgetEvidence,
  type BuildComputeBudgetEvidenceInput,
  type ComputeBudgetAccountProjection,
  type ComputeBudgetEvidence,
  type ComputeBudgetEvidenceBinding,
  type ComputeBudgetEvidenceStatus,
  type ComputeBudgetEvidenceVerification,
  type ComputeEvidenceTrustAnchor,
  type VerifyComputeBudgetEvidenceInput,
} from '@holoscript/core/world-model';

const schemaVersion: 'holoscript.compute-budget-evidence.v1' =
  COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION;
const status: ComputeBudgetEvidenceStatus = 'held';
const projection: ComputeBudgetAccountProjection = {
  heldAmountMinorUnits: 500,
  settledAmountMinorUnits: 0,
  version: 1,
};

const anchor: ComputeEvidenceTrustAnchor = {
  issuer: 'urn:holoscript:consumer:budget',
  keyId: 'budget-key-1',
  algorithm: 'ed25519',
  roles: ['budget_ledger_attestor'],
  principalDigests: [`sha256:${'a'.repeat(64)}`],
  teamIds: ['team-consumer'],
  budgetRailIds: ['gpu-managed-usd'],
  validFrom: '2026-08-01T00:00:00.000Z',
  validUntil: '2026-08-02T00:00:00.000Z',
  publicKeyPem: 'test-public-key',
};

const build: (input: BuildComputeBudgetEvidenceInput) => ComputeBudgetEvidence =
  buildComputeBudgetEvidence;
const validate: (value: unknown) => {
  readonly valid: boolean;
  readonly errors: readonly string[];
} = validateComputeBudgetEvidence;
const verify: (input: VerifyComputeBudgetEvidenceInput) => ComputeBudgetEvidenceVerification =
  verifyComputeBudgetEvidence;

declare const binding: ComputeBudgetEvidenceBinding;
const currency: 'USD' = binding.currency;
const maxAmountMinorUnits: number = binding.maxAmountMinorUnits;

void schemaVersion;
void status;
void projection;
void anchor;
void build;
void validate;
void verify;
void currency;
void maxAmountMinorUnits;
