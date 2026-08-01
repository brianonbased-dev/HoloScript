/**
 * PostgreSQL custody for compute-job transitions and optional exclusive-capacity CAS.
 *
 * This store is deliberately fail-closed. Fleet snapshots are observations;
 * only a successfully committed and read-back transaction in this module is a
 * durable job decision. Acquire/release commands include allocation custody in
 * the same transaction; job-only transitions issue no allocation SQL. There is
 * no in-memory backend or fallback. Commit plus readback proves only the exact
 * database bytes returned here; it does not prove an external provider
 * reservation, GPU execution, or provider-side action.
 */

import { createHash } from 'crypto';
import {
  COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION,
  COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION,
  COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION,
  COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION,
  COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION,
  COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION,
  COMPUTE_JOB_REQUEST_SCHEMA_VERSION,
  computeJobRequestHash,
  validateComputeBridgeAdmission,
  validateComputeAllocatorCommitReceipt,
  validateComputeCapacityAllocationCursor,
  validateComputeCapacityLease,
  validateComputeCapacitySnapshot,
  validateComputeExecutionReceipt,
  validateComputeJobReceipt,
  validateComputeJobTransitionReceipt,
  validateComputePlacementPlan,
  validateComputeSubjectAttestation,
  verifyComputeJobTransition,
  type ComputeAllocatorCommitReceipt,
  type ComputeCapacityAllocationCursor,
  type ComputeCapacityLane,
  type ComputeJobReceipt,
  type ComputeJobTransitionReceipt,
} from '@holoscript/core/world-model';
import {
  computeWorkUnitDigest,
  validateComputeWorkUnitContract,
  type ComputeWorkUnitContract,
} from '@holoscript/core/compiler';
import {
  COMPUTE_JOB_ADMISSION_SCHEMA_VERSION,
  verifyComputeJobAdmission,
  type ComputeJobAdmissionEnvelope,
  type ComputeJobAdmissionReceipt,
  type ComputeJobAdmissionTrustAnchor,
} from './compute-job-admission';
import {
  COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION,
  COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION,
  type ComputeFleetDataPolicy,
  type ComputeFleetResourceEligibilityBinding,
} from './compute-fleet-adapter';
import { createHoloMeshPostgresPoolOptions } from './postgres-pool-options';

export const COMPUTE_JOB_PUBLIC_RESPONSE_SCHEMA_VERSION =
  'holoscript.compute-job-public-response.v1' as const;
export const COMPUTE_JOB_OUTBOX_SCHEMA_VERSION = 'holoscript.compute-job-outbox.v1' as const;
export const COMPUTE_JOB_STORE_SCHEMA_VERSION = 'holoscript.compute-job-store-schema.v1' as const;
export const COMPUTE_JOB_STORE_SCHEMA_MANIFEST = {
  schemaVersion: COMPUTE_JOB_STORE_SCHEMA_VERSION,
  relations: [
    'holomesh_compute_store_meta',
    'holomesh_compute_jobs',
    'holomesh_compute_allocations',
    'holomesh_compute_capacity_bindings',
    'holomesh_compute_capacity_registrations',
    'holomesh_compute_admissions',
    'holomesh_compute_admission_refs',
    'holomesh_compute_evidence',
    'holomesh_compute_evidence_refs',
    'holomesh_compute_transitions',
    'holomesh_compute_allocation_commits',
    'holomesh_compute_idempotency',
    'holomesh_compute_job_creation_idempotency',
    'holomesh_compute_outbox',
  ],
  attemptSqlType: 'bigint',
  capacityPolicyStorage: 'typed_timestamptz_and_text_array',
  admissionCustody: {
    bytes: 'canonical_ed25519_receipt',
    referenceCardinality: 'one_per_operation_receipt',
    effectiveExpiry: 'min_receipt_anchor_revocation_db_clock',
  },
  schemaCatalogVerification: 'full_relations_columns_constraints_indexes_triggers_sha256',
  requiredIndexes: [
    'idx_compute_allocation_current_lease',
    'idx_compute_admission_refs_job',
    'idx_compute_evidence_refs_job',
    'idx_compute_outbox_delivery',
  ],
  readbackAuthority: 'immutable_journals',
} as const;
export const COMPUTE_JOB_STORE_SCHEMA_FINGERPRINT = contentDigest(
  COMPUTE_JOB_STORE_SCHEMA_MANIFEST
);
export const COMPUTE_JOB_STORE_CATALOG_DIGEST =
  'sha256:168960adc98553bfbf5ae9722a250ea244cae62d387b033ec0cdfd951b01cee0' as const;

export const COMPUTE_JOB_STORE_SCHEMA_SQL = `
/* compute:schema */
SELECT pg_advisory_xact_lock(
  hashtextextended('holomesh.compute-job-store-schema', 0)
);

CREATE TABLE IF NOT EXISTS holomesh_compute_store_meta (
  singleton          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  schema_version     TEXT NOT NULL,
  schema_fingerprint TEXT NOT NULL CHECK (schema_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  installed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $compute_schema_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relkind = 'r' AND c.relname = ANY(ARRAY[
      'holomesh_compute_jobs',
      'holomesh_compute_allocations',
      'holomesh_compute_capacity_bindings',
      'holomesh_compute_capacity_registrations',
      'holomesh_compute_admissions',
      'holomesh_compute_admission_refs',
      'holomesh_compute_evidence',
      'holomesh_compute_evidence_refs',
      'holomesh_compute_transitions',
      'holomesh_compute_allocation_commits',
      'holomesh_compute_idempotency',
      'holomesh_compute_job_creation_idempotency',
      'holomesh_compute_outbox'
    ])
  ) AND NOT EXISTS (SELECT 1 FROM holomesh_compute_store_meta WHERE singleton = TRUE) THEN
    RAISE EXCEPTION 'unversioned compute custody schema exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM holomesh_compute_store_meta
    WHERE singleton = TRUE AND (
      schema_version <> '${COMPUTE_JOB_STORE_SCHEMA_VERSION}' OR
      schema_fingerprint <> '${COMPUTE_JOB_STORE_SCHEMA_FINGERPRINT}'
    )
  ) THEN
    RAISE EXCEPTION 'compute custody schema version or fingerprint differs';
  END IF;
END
$compute_schema_guard$;

CREATE TABLE IF NOT EXISTS holomesh_compute_jobs (
  team_id                 TEXT NOT NULL,
  job_id                  TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt                 BIGINT NOT NULL CHECK (attempt >= 1),
  principal_digest        TEXT NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
  work_unit_digest        TEXT NOT NULL CHECK (work_unit_digest ~ '^sha256:[0-9a-f]{64}$'),
  state                   TEXT NOT NULL CHECK (state IN (
                            'preflighted', 'queued', 'leased', 'starting', 'running',
                            'succeeded', 'failed', 'cancelled'
                          )),
  version                 BIGINT NOT NULL CHECK (version >= 0),
  receipt_id              TEXT NOT NULL CHECK (receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  job_bytes               TEXT NOT NULL,
  capacity_ref            TEXT,
  lease_receipt_id        TEXT,
  fencing_epoch           BIGINT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, job_id, attempt),
  CHECK (
    (capacity_ref IS NULL AND lease_receipt_id IS NULL AND fencing_epoch IS NULL) OR
    (capacity_ref IS NOT NULL AND lease_receipt_id IS NOT NULL AND fencing_epoch IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS holomesh_compute_allocations (
  team_id                  TEXT NOT NULL,
  capacity_ref             TEXT NOT NULL CHECK (capacity_ref ~ '^sha256:[0-9a-f]{64}$'),
  lane                     TEXT NOT NULL CHECK (lane IN ('local_device', 'owned_fleet', 'managed_bridge')),
  slot_state               TEXT NOT NULL CHECK (slot_state IN ('available', 'leased')),
  current_epoch            BIGINT NOT NULL CHECK (current_epoch >= 0),
  current_lease_receipt_id TEXT,
  version                  BIGINT NOT NULL CHECK (version >= 0),
  etag                     TEXT NOT NULL CHECK (etag ~ '^sha256:[0-9a-f]{64}$'),
  cursor_bytes             TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, capacity_ref),
  CHECK (
    (slot_state = 'available' AND current_lease_receipt_id IS NULL) OR
    (slot_state = 'leased' AND current_lease_receipt_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compute_allocation_current_lease
  ON holomesh_compute_allocations (team_id, current_lease_receipt_id)
  WHERE current_lease_receipt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS holomesh_compute_capacity_bindings (
  team_id                  TEXT NOT NULL,
  capacity_ref             TEXT NOT NULL CHECK (capacity_ref ~ '^sha256:[0-9a-f]{64}$'),
  provider                 TEXT NOT NULL,
  provider_resource_id     TEXT NOT NULL,
  eligible                 BOOLEAN NOT NULL,
  valid_until              TIMESTAMPTZ NOT NULL,
  data_policy_valid_until  TIMESTAMPTZ NOT NULL,
  allowed_data_classifications TEXT[] NOT NULL CHECK (
    cardinality(allowed_data_classifications) > 0
  ),
  eligibility_bytes        TEXT NOT NULL,
  data_policy_bytes        TEXT NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, capacity_ref),
  UNIQUE (team_id, provider, provider_resource_id),
  FOREIGN KEY (team_id, capacity_ref)
    REFERENCES holomesh_compute_allocations (team_id, capacity_ref) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS holomesh_compute_capacity_registrations (
  team_id          TEXT NOT NULL,
  capacity_ref     TEXT NOT NULL CHECK (capacity_ref ~ '^sha256:[0-9a-f]{64}$'),
  lane             TEXT NOT NULL CHECK (lane IN ('local_device', 'owned_fleet', 'managed_bridge')),
  initial_etag     TEXT NOT NULL CHECK (initial_etag ~ '^sha256:[0-9a-f]{64}$'),
  cursor_bytes     TEXT NOT NULL,
  eligibility_bytes TEXT NOT NULL,
  data_policy_bytes  TEXT NOT NULL,
  registered_at    TEXT NOT NULL,
  committed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, capacity_ref)
);

CREATE TABLE IF NOT EXISTS holomesh_compute_admissions (
  team_id              TEXT NOT NULL,
  receipt_id           TEXT NOT NULL CHECK (receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  schema_version       TEXT NOT NULL CHECK (schema_version = '${COMPUTE_JOB_ADMISSION_SCHEMA_VERSION}'),
  issuer               TEXT NOT NULL,
  key_id               TEXT NOT NULL,
  principal_digest     TEXT NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
  job_id               TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt              BIGINT NOT NULL CHECK (attempt >= 1),
  operation            TEXT NOT NULL CHECK (operation IN (
                           'compute_job.create', 'compute_job.queue',
                           'compute_job.acquire_lease', 'compute_job.start',
                           'compute_job.mark_running', 'compute_job.succeed',
                           'compute_job.fail', 'compute_job.cancel'
                         )),
  request_digest       TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  work_unit_digest     TEXT NOT NULL CHECK (work_unit_digest ~ '^sha256:[0-9a-f]{64}$'),
  data_classification  TEXT NOT NULL CHECK (data_classification IN (
                           'public', 'internal', 'confidential', 'restricted'
                         )),
  trust_policy_digest  TEXT NOT NULL CHECK (trust_policy_digest ~ '^sha256:[0-9a-f]{64}$'),
  verification_scope   TEXT NOT NULL CHECK (verification_scope = 'authenticated_admission_only'),
  provider_reservation TEXT NOT NULL CHECK (provider_reservation = 'not_proven'),
  execution            TEXT NOT NULL CHECK (execution = 'not_proven'),
  verified_at          TIMESTAMPTZ NOT NULL,
  valid_until          TIMESTAMPTZ NOT NULL,
  effective_valid_until TIMESTAMPTZ NOT NULL,
  admission_bytes      TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holomesh_compute_admissions_pkey PRIMARY KEY (team_id, receipt_id),
  CONSTRAINT holomesh_compute_admissions_valid_window_check
    CHECK (valid_until > verified_at),
  CONSTRAINT holomesh_compute_admissions_effective_window_check
    CHECK (effective_valid_until > verified_at AND effective_valid_until <= valid_until)
);

CREATE TABLE IF NOT EXISTS holomesh_compute_admission_refs (
  team_id              TEXT NOT NULL,
  job_id               TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt              BIGINT NOT NULL CHECK (attempt >= 1),
  operation            TEXT NOT NULL CHECK (operation IN (
                           'compute_job.create', 'compute_job.queue',
                           'compute_job.acquire_lease', 'compute_job.start',
                           'compute_job.mark_running', 'compute_job.succeed',
                           'compute_job.fail', 'compute_job.cancel'
                         )),
  operation_receipt_id TEXT NOT NULL CHECK (operation_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  admission_receipt_id TEXT NOT NULL CHECK (admission_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT holomesh_compute_admission_refs_pkey
    PRIMARY KEY (team_id, operation_receipt_id),
  CONSTRAINT holomesh_compute_admission_refs_admission_unique
    UNIQUE (team_id, admission_receipt_id),
  CONSTRAINT holomesh_compute_admission_refs_admission_fk
    FOREIGN KEY (team_id, admission_receipt_id)
    REFERENCES holomesh_compute_admissions (team_id, receipt_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_compute_admission_refs_job
  ON holomesh_compute_admission_refs (team_id, job_id, attempt, operation_receipt_id);

CREATE TABLE IF NOT EXISTS holomesh_compute_evidence (
  team_id        TEXT NOT NULL,
  receipt_id     TEXT NOT NULL CHECK (receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  schema_version TEXT NOT NULL,
  evidence_bytes TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, receipt_id)
);

CREATE TABLE IF NOT EXISTS holomesh_compute_evidence_refs (
  team_id              TEXT NOT NULL,
  job_id               TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt              BIGINT NOT NULL CHECK (attempt >= 1),
  operation_receipt_id TEXT NOT NULL CHECK (operation_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  evidence_receipt_id  TEXT NOT NULL CHECK (evidence_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, operation_receipt_id, evidence_receipt_id),
  FOREIGN KEY (team_id, evidence_receipt_id)
    REFERENCES holomesh_compute_evidence (team_id, receipt_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_compute_evidence_refs_job
  ON holomesh_compute_evidence_refs (team_id, job_id, attempt, operation_receipt_id);

CREATE TABLE IF NOT EXISTS holomesh_compute_transitions (
  team_id               TEXT NOT NULL,
  transition_receipt_id TEXT NOT NULL CHECK (transition_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  job_id                TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt               BIGINT NOT NULL CHECK (attempt >= 1),
  from_state            TEXT NOT NULL,
  to_state              TEXT NOT NULL,
  from_version          BIGINT NOT NULL CHECK (from_version >= 0),
  to_version            BIGINT NOT NULL CHECK (to_version >= 1),
  from_receipt_id       TEXT NOT NULL CHECK (from_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  to_receipt_id         TEXT NOT NULL CHECK (to_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  request_digest        TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  transition_bytes      TEXT NOT NULL,
  to_job_bytes          TEXT NOT NULL,
  committed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, transition_receipt_id),
  UNIQUE (team_id, job_id, attempt, to_version)
);

CREATE TABLE IF NOT EXISTS holomesh_compute_allocation_commits (
  team_id                      TEXT NOT NULL,
  allocation_commit_receipt_id TEXT NOT NULL CHECK (allocation_commit_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  capacity_ref                 TEXT NOT NULL CHECK (capacity_ref ~ '^sha256:[0-9a-f]{64}$'),
  job_id                       TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt                      BIGINT NOT NULL CHECK (attempt >= 1),
  transition_receipt_id        TEXT NOT NULL CHECK (transition_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  lease_receipt_id             TEXT,
  previous_version             BIGINT NOT NULL CHECK (previous_version >= 0),
  next_version                 BIGINT NOT NULL CHECK (next_version >= 1),
  previous_etag                TEXT NOT NULL CHECK (previous_etag ~ '^sha256:[0-9a-f]{64}$'),
  next_etag                    TEXT NOT NULL CHECK (next_etag ~ '^sha256:[0-9a-f]{64}$'),
  previous_epoch               BIGINT NOT NULL CHECK (previous_epoch >= 0),
  next_epoch                   BIGINT NOT NULL CHECK (next_epoch >= 0),
  previous_slot_state          TEXT NOT NULL CHECK (previous_slot_state IN ('available', 'leased')),
  next_slot_state              TEXT NOT NULL CHECK (next_slot_state IN ('available', 'leased')),
  commit_bytes                 TEXT NOT NULL,
  next_cursor_bytes            TEXT NOT NULL,
  committed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, allocation_commit_receipt_id),
  UNIQUE (team_id, capacity_ref, next_version),
  UNIQUE (team_id, transition_receipt_id)
);

CREATE TABLE IF NOT EXISTS holomesh_compute_idempotency (
  team_id                      TEXT NOT NULL,
  principal_digest             TEXT NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
  operation                    TEXT NOT NULL,
  key_digest                   TEXT NOT NULL CHECK (key_digest ~ '^sha256:[0-9a-f]{64}$'),
  request_digest               TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  status                       TEXT NOT NULL CHECK (status IN ('pending', 'committed')),
  job_id                       TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt                      BIGINT NOT NULL CHECK (attempt >= 1),
  transition_receipt_id        TEXT,
  allocation_commit_receipt_id TEXT,
  admission_receipt_id         TEXT CHECK (admission_receipt_id IS NULL OR admission_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  public_response_bytes        TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at                 TIMESTAMPTZ,
  PRIMARY KEY (team_id, principal_digest, operation, key_digest),
  CHECK (
    (status = 'pending' AND transition_receipt_id IS NULL
                        AND allocation_commit_receipt_id IS NULL
                        AND admission_receipt_id IS NULL
                        AND public_response_bytes IS NULL
                        AND committed_at IS NULL) OR
    (status = 'committed' AND transition_receipt_id IS NOT NULL
                          AND admission_receipt_id IS NOT NULL
                          AND public_response_bytes IS NOT NULL
                          AND committed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS holomesh_compute_job_creation_idempotency (
  team_id               TEXT NOT NULL,
  principal_digest      TEXT NOT NULL CHECK (principal_digest ~ '^sha256:[0-9a-f]{64}$'),
  operation             TEXT NOT NULL,
  key_digest            TEXT NOT NULL CHECK (key_digest ~ '^sha256:[0-9a-f]{64}$'),
  request_digest        TEXT NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  status                TEXT NOT NULL CHECK (status IN ('pending', 'committed')),
  job_id                TEXT NOT NULL CHECK (job_id ~ '^sha256:[0-9a-f]{64}$'),
  attempt               BIGINT NOT NULL CHECK (attempt >= 1),
  job_receipt_id        TEXT,
  admission_receipt_id  TEXT CHECK (admission_receipt_id IS NULL OR admission_receipt_id ~ '^sha256:[0-9a-f]{64}$'),
  created_job_bytes     TEXT,
  public_response_bytes TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at          TIMESTAMPTZ,
  PRIMARY KEY (team_id, principal_digest, operation, key_digest),
  CHECK (
    (status = 'pending' AND job_receipt_id IS NULL
                        AND admission_receipt_id IS NULL
                        AND created_job_bytes IS NULL
                        AND public_response_bytes IS NULL
                        AND committed_at IS NULL) OR
    (status = 'committed' AND job_receipt_id IS NOT NULL
                          AND admission_receipt_id IS NOT NULL
                          AND created_job_bytes IS NOT NULL
                          AND public_response_bytes IS NOT NULL
                          AND committed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS holomesh_compute_outbox (
  team_id         TEXT NOT NULL,
  event_id        TEXT NOT NULL CHECK (event_id ~ '^sha256:[0-9a-f]{64}$'),
  aggregate_kind  TEXT NOT NULL,
  aggregate_id    TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  payload_bytes   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'dead')),
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at       TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_compute_outbox_delivery
  ON holomesh_compute_outbox (status, available_at, created_at);

INSERT INTO holomesh_compute_store_meta
  (singleton, schema_version, schema_fingerprint)
VALUES (TRUE, '${COMPUTE_JOB_STORE_SCHEMA_VERSION}', '${COMPUTE_JOB_STORE_SCHEMA_FINGERPRINT}')
ON CONFLICT (singleton) DO NOTHING;
`;

export const COMPUTE_JOB_STORE_SCHEMA_VERIFY_SQL = `
/* compute:schema-verify */
WITH required_relations(table_name) AS (
  VALUES
    ('holomesh_compute_store_meta'),
    ('holomesh_compute_jobs'),
    ('holomesh_compute_allocations'),
    ('holomesh_compute_capacity_bindings'),
    ('holomesh_compute_capacity_registrations'),
    ('holomesh_compute_admissions'),
    ('holomesh_compute_admission_refs'),
    ('holomesh_compute_evidence'),
    ('holomesh_compute_evidence_refs'),
    ('holomesh_compute_transitions'),
    ('holomesh_compute_allocation_commits'),
    ('holomesh_compute_idempotency'),
    ('holomesh_compute_job_creation_idempotency'),
    ('holomesh_compute_outbox')
), required_constraints(table_name, checks, primary_keys, uniques, foreign_keys) AS (
  VALUES
    ('holomesh_compute_store_meta', 2, 1, 0, 0),
    ('holomesh_compute_jobs', 8, 1, 0, 0),
    ('holomesh_compute_allocations', 7, 1, 0, 0),
    ('holomesh_compute_capacity_bindings', 2, 1, 1, 1),
    ('holomesh_compute_capacity_registrations', 3, 1, 0, 0),
    ('holomesh_compute_admissions', 15, 1, 0, 0),
    ('holomesh_compute_admission_refs', 5, 1, 1, 1),
    ('holomesh_compute_evidence', 1, 1, 0, 0),
    ('holomesh_compute_evidence_refs', 4, 1, 0, 1),
    ('holomesh_compute_transitions', 8, 1, 1, 0),
    ('holomesh_compute_allocation_commits', 13, 1, 2, 0),
    ('holomesh_compute_idempotency', 8, 1, 0, 0),
    ('holomesh_compute_job_creation_idempotency', 8, 1, 0, 0),
    ('holomesh_compute_outbox', 3, 1, 0, 0)
), actual_constraints AS (
  SELECT c.relname AS table_name,
         COUNT(*) FILTER (WHERE con.contype = 'c')::int AS checks,
         COUNT(*) FILTER (WHERE con.contype = 'p')::int AS primary_keys,
         COUNT(*) FILTER (WHERE con.contype = 'u')::int AS uniques,
         COUNT(*) FILTER (WHERE con.contype = 'f')::int AS foreign_keys
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_constraint con ON con.conrelid = c.oid
  JOIN required_relations r ON r.table_name = c.relname
  WHERE c.relkind = 'r' AND n.nspname = current_schema()
  GROUP BY c.relname
), compute_relations AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relreplident
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN required_relations r ON r.table_name = c.relname
  WHERE c.relkind = 'r' AND n.nspname = current_schema()
), required_bigint_attempts(table_name) AS (
  VALUES
    ('holomesh_compute_jobs'),
    ('holomesh_compute_admissions'),
    ('holomesh_compute_admission_refs'),
    ('holomesh_compute_evidence_refs'),
    ('holomesh_compute_transitions'),
    ('holomesh_compute_allocation_commits'),
    ('holomesh_compute_idempotency'),
    ('holomesh_compute_job_creation_idempotency')
), required_timestamptz_columns(table_name, column_name) AS (
  VALUES
    ('holomesh_compute_capacity_bindings', 'valid_until'),
    ('holomesh_compute_capacity_bindings', 'data_policy_valid_until'),
    ('holomesh_compute_admissions', 'verified_at'),
    ('holomesh_compute_admissions', 'valid_until'),
    ('holomesh_compute_admissions', 'effective_valid_until')
), catalog_signature(value) AS (
  SELECT jsonb_build_object(
    'relations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          r.relname, r.relrowsecurity, r.relforcerowsecurity, r.relreplident
        ) ORDER BY r.relname
      )
      FROM compute_relations r
    ), '[]'::jsonb),
    'columns', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          r.relname, a.attnum, a.attname,
          pg_catalog.format_type(a.atttypid, a.atttypmod),
          a.attnotnull, a.attidentity, a.attgenerated,
          a.attcollation::pg_catalog.regcollation::text,
          COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid, true), '')
        ) ORDER BY r.relname, a.attnum
      )
      FROM compute_relations r
      JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = r.oid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped
    ), '[]'::jsonb),
    'constraints', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          r.relname, con.contype, con.convalidated, con.condeferrable, con.condeferred,
          pg_catalog.pg_get_constraintdef(con.oid, true)
        ) ORDER BY r.relname, con.contype, con.conname
      )
      FROM compute_relations r
      JOIN pg_catalog.pg_constraint con ON con.conrelid = r.oid
    ), '[]'::jsonb),
    'indexes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          r.relname, ci.relname, i.indisunique, i.indisprimary,
          i.indisvalid, i.indisready, i.indislive,
          pg_catalog.pg_get_indexdef(i.indexrelid, 0, true)
        ) ORDER BY r.relname, ci.relname
      )
      FROM compute_relations r
      JOIN pg_catalog.pg_index i ON i.indrelid = r.oid
      JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
    ), '[]'::jsonb),
    'triggers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(
          r.relname, t.tgname, t.tgenabled,
          pg_catalog.pg_get_triggerdef(t.oid, true)
        ) ORDER BY r.relname, t.tgname
      )
      FROM compute_relations r
      JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid
      WHERE NOT t.tgisinternal
    ), '[]'::jsonb)
  )::text
)
SELECT
  EXISTS (
    SELECT 1 FROM holomesh_compute_store_meta
    WHERE singleton = TRUE
      AND schema_version = '${COMPUTE_JOB_STORE_SCHEMA_VERSION}'
      AND schema_fingerprint = '${COMPUTE_JOB_STORE_SCHEMA_FINGERPRINT}'
  ) AS meta_ok,
  NOT EXISTS (
    SELECT 1 FROM required_constraints r
    LEFT JOIN actual_constraints a USING (table_name)
    WHERE a.table_name IS NULL OR a.checks <> r.checks
      OR a.primary_keys <> r.primary_keys OR a.uniques <> r.uniques
      OR a.foreign_keys <> r.foreign_keys
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_jobs'
      AND con.conname = 'holomesh_compute_jobs_state_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%preflighted%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%succeeded%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%cancelled%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_jobs'
      AND con.conname = 'holomesh_compute_jobs_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%capacity_ref IS NULL%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%fencing_epoch IS NOT NULL%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_allocations'
      AND con.conname = 'holomesh_compute_allocations_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%current_lease_receipt_id IS NULL%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%current_lease_receipt_id IS NOT NULL%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_idempotency'
      AND con.conname = 'holomesh_compute_idempotency_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%status = ''pending''%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%status = ''committed''%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%admission_receipt_id IS NULL%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%admission_receipt_id IS NOT NULL%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_job_creation_idempotency'
      AND con.conname = 'holomesh_compute_job_creation_idempotency_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%status = ''pending''%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%status = ''committed''%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%admission_receipt_id IS NULL%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%admission_receipt_id IS NOT NULL%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admissions'
      AND con.conname = 'holomesh_compute_admissions_schema_version_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%holomesh.compute-job-admission.v1%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admissions'
      AND con.conname = 'holomesh_compute_admissions_operation_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%compute_job.create%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%compute_job.acquire_lease%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%compute_job.cancel%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admissions'
      AND con.conname = 'holomesh_compute_admissions_data_classification_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%confidential%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%restricted%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admissions'
      AND con.conname = 'holomesh_compute_admissions_effective_window_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%effective_valid_until > verified_at%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%effective_valid_until <= valid_until%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admission_refs'
      AND con.conname = 'holomesh_compute_admission_refs_operation_check'
      AND pg_get_constraintdef(con.oid, true) LIKE '%compute_job.create%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%compute_job.cancel%'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admission_refs'
      AND con.conname = 'holomesh_compute_admission_refs_pkey'
      AND pg_get_constraintdef(con.oid, true) = 'PRIMARY KEY (team_id, operation_receipt_id)'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admission_refs'
      AND con.conname = 'holomesh_compute_admission_refs_admission_unique'
      AND pg_get_constraintdef(con.oid, true) = 'UNIQUE (team_id, admission_receipt_id)'
  ) AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n
      ON n.oid = c.relnamespace AND n.nspname = current_schema()
    WHERE c.relname = 'holomesh_compute_admission_refs'
      AND con.conname = 'holomesh_compute_admission_refs_admission_fk'
      AND pg_get_constraintdef(con.oid, true) LIKE '%FOREIGN KEY (team_id, admission_receipt_id)%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%REFERENCES holomesh_compute_admissions(team_id, receipt_id)%'
      AND pg_get_constraintdef(con.oid, true) LIKE '%ON DELETE RESTRICT%'
  ) AS constraints_ok,
  NOT EXISTS (
    SELECT 1 FROM required_bigint_attempts r
    LEFT JOIN information_schema.columns c
      ON c.table_schema = current_schema() AND c.table_name = r.table_name
      AND c.column_name = 'attempt'
    WHERE c.data_type IS DISTINCT FROM 'bigint'
  ) AS attempts_ok,
  NOT EXISTS (
    SELECT 1 FROM required_timestamptz_columns r
    LEFT JOIN information_schema.columns c
      ON c.table_schema = current_schema() AND c.table_name = r.table_name
      AND c.column_name = r.column_name
    WHERE c.data_type IS DISTINCT FROM 'timestamp with time zone'
  ) AS timestamps_ok,
  EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()
      AND indexname = 'idx_compute_allocation_current_lease'
      AND indexdef LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(team_id, current_lease_receipt_id)%'
      AND indexdef LIKE '%WHERE (current_lease_receipt_id IS NOT NULL)%'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()
      AND indexname = 'idx_compute_admission_refs_job'
      AND indexdef NOT LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(team_id, job_id, attempt, operation_receipt_id)%'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()
      AND indexname = 'idx_compute_evidence_refs_job'
      AND indexdef NOT LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(team_id, job_id, attempt, operation_receipt_id)%'
  ) AND EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema()
      AND indexname = 'idx_compute_outbox_delivery'
      AND indexdef NOT LIKE 'CREATE UNIQUE INDEX%'
      AND indexdef LIKE '%(status, available_at, created_at)%'
  ) AS indexes_ok,
  'sha256:' || encode(
    sha256(convert_to((SELECT value FROM catalog_signature), 'UTF8')),
    'hex'
  ) AS catalog_digest;
`;

export const COMPUTE_CAPACITY_ELIGIBILITY_BINDING_SCHEMA_VERSION =
  COMPUTE_FLEET_RESOURCE_ELIGIBILITY_SCHEMA_VERSION;
export const COMPUTE_CAPACITY_DATA_POLICY_SCHEMA_VERSION = COMPUTE_FLEET_DATA_POLICY_SCHEMA_VERSION;

const SHA256_LABEL = /^sha256:[a-f0-9]{64}$/;
const COMPUTE_DATA_CLASSIFICATIONS = new Set(['public', 'internal', 'confidential', 'restricted']);
const RETRYABLE_SQL_STATES = new Set(['40001', '40P01']);
const DEFAULT_MAX_TRANSACTION_RETRIES = 2;
const MAX_TRANSACTION_RETRIES = 8;

interface QueryResultLike<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number | null;
}

export interface ComputeJobStoreClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResultLike<Row>>;
  release(): void;
}

export interface ComputeJobStorePool {
  connect(): Promise<ComputeJobStoreClient>;
  end?(): Promise<void>;
}

export interface ComputeDurableEnvelope {
  readonly receiptId: string;
  readonly schemaVersion: string;
  /** Exact UTF-8 JSON bytes represented as a JavaScript string. */
  readonly bytes: string;
}

/** Exact compiler-produced WorkUnit bytes used for allocation policy enforcement. */
export interface ComputeWorkUnitEnvelope {
  readonly digest: string;
  readonly contract: ComputeWorkUnitContract;
  readonly bytes: string;
}

export interface ComputeJobProjection {
  readonly teamId: string;
  readonly receipt: ComputeJobReceipt;
  readonly bytes: string;
}

export interface ComputeAllocationProjection {
  readonly teamId: string;
  readonly lane: ComputeCapacityLane;
  readonly cursor: ComputeCapacityAllocationCursor;
  readonly bytes: string;
}

export interface ComputeTransitionEnvelope {
  readonly receipt: ComputeJobTransitionReceipt;
  readonly bytes: string;
}

export interface ComputeAllocatorCommitEnvelope {
  readonly receipt: ComputeAllocatorCommitReceipt;
  readonly bytes: string;
}

export interface ComputeOutboxEnvelope {
  readonly eventId: string;
  readonly aggregateKind: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly bytes: string;
}

/** Server-local provider identity. Never echo this object in public responses or outbox payloads. */
export type ComputeCapacityEligibilityBinding = Omit<
  ComputeFleetResourceEligibilityBinding,
  'eligible'
> & {
  readonly eligible: true;
};

export type ComputeCapacityDataPolicy = ComputeFleetDataPolicy;

export interface RegisterComputeCapacityCommand {
  readonly projection: ComputeAllocationProjection;
  readonly eligibility: ComputeCapacityEligibilityBinding;
  readonly eligibilityBytes: string;
  readonly dataPolicy: ComputeCapacityDataPolicy;
  readonly dataPolicyBytes: string;
  readonly registeredAt: string;
}

export interface RegisterComputeCapacityResult {
  readonly disposition: 'committed' | 'replayed';
  readonly capacityRef: string;
  readonly lane: ComputeCapacityLane;
  readonly etag: string;
  readonly cursorBytes: string;
}

export interface ReadComputeJobInput {
  readonly teamId: string;
  readonly jobId: string;
  readonly attempt: number;
}

export interface ReadRegisteredComputeCapacityInput {
  readonly teamId: string;
  readonly capacityRef: string;
}

/** Internal normalization input. This type is never a public API response. */
export interface RegisteredComputeCapacity {
  readonly projection: ComputeAllocationProjection;
  readonly eligibility: ComputeCapacityEligibilityBinding;
  readonly eligibilityBytes: string;
  readonly dataPolicy: ComputeCapacityDataPolicy;
  readonly dataPolicyBytes: string;
}

export interface CreateComputeJobCommand {
  readonly operation: string;
  /** Digest only. The plaintext idempotency key must never reach this store. */
  readonly idempotencyKeyDigest: string;
  readonly requestDigest: string;
  readonly job: ComputeJobProjection;
  /** Exact compiler-produced WorkUnit bytes bound by both job and admission receipts. */
  readonly workUnit: ComputeWorkUnitEnvelope;
  readonly evidence: readonly ComputeDurableEnvelope[];
  readonly admission: ComputeJobAdmissionEnvelope;
  readonly outbox: readonly ComputeOutboxEnvelope[];
  readonly publicResponseBytes: string;
}

export interface CreateComputeJobResult {
  readonly disposition: 'committed' | 'replayed';
  readonly publicResponseBytes: string;
  readonly jobReceiptId: string;
  readonly readBack: {
    readonly admissionReceiptId: string;
    readonly evidenceReceiptIds: readonly string[];
    readonly outboxEventIds: readonly string[];
  };
}

export interface CommitComputeJobTransitionCommand {
  readonly operation: string;
  /** Digest only. The plaintext idempotency key must never reach this store. */
  readonly idempotencyKeyDigest: string;
  readonly requestDigest: string;
  readonly expectedJob: ComputeJobProjection;
  readonly nextJob: ComputeJobProjection;
  /** All allocation fields are present for acquire/release, or all absent. */
  readonly expectedAllocation?: ComputeAllocationProjection;
  readonly nextAllocation?: ComputeAllocationProjection;
  /** Exact compiler-produced policy bytes whose digest is already bound by the job receipt. */
  readonly expectedWorkUnit: ComputeWorkUnitEnvelope;
  /** Exact server-local capacity eligibility bytes expected by this allocator CAS. */
  readonly expectedCapacityEligibilityBytes?: string;
  readonly expectedCapacityDataPolicyBytes?: string;
  readonly evidence: readonly ComputeDurableEnvelope[];
  readonly admission: ComputeJobAdmissionEnvelope;
  readonly transition: ComputeTransitionEnvelope;
  readonly allocationCommit?: ComputeAllocatorCommitEnvelope;
  readonly outbox: readonly ComputeOutboxEnvelope[];
  /** Exact public response JSON. It may contain hashes, never bearer material. */
  readonly publicResponseBytes: string;
}

export interface CommitComputeJobTransitionResult {
  readonly disposition: 'committed' | 'replayed';
  readonly publicResponseBytes: string;
  readonly transitionReceiptId: string;
  readonly allocationCommitReceiptId?: string;
  readonly readBack: {
    readonly jobReceiptId: string;
    readonly admissionReceiptId: string;
    readonly allocationEtag?: string;
    readonly evidenceReceiptIds: readonly string[];
    readonly outboxEventIds: readonly string[];
  };
}

export type ComputeJobStoreConflictCode =
  | 'idempotency_key_reused'
  | 'idempotency_incomplete'
  | 'job_cas_conflict'
  | 'allocation_cas_conflict'
  | 'job_already_exists'
  | 'capacity_registration_conflict'
  | 'immutable_receipt_conflict';

export class ComputeJobStoreUnavailableError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ComputeJobStoreUnavailableError';
  }
}

export class ComputeJobStoreConflictError extends Error {
  constructor(
    readonly code: ComputeJobStoreConflictCode,
    message: string
  ) {
    super(message);
    this.name = 'ComputeJobStoreConflictError';
  }
}

export class ComputeJobStoreAdmissionError extends Error {
  constructor(readonly reasonCodes: readonly string[]) {
    super(`compute job admission was rejected: ${reasonCodes.join(', ')}`);
    this.name = 'ComputeJobStoreAdmissionError';
  }
}

/** The transaction committed, but its exact immutable bytes could not be read back. */
export class ComputeJobStoreReadbackError extends Error {
  readonly committed = true;

  constructor(message: string) {
    super(message);
    this.name = 'ComputeJobStoreReadbackError';
  }
}

export class ComputeJobStoreNotFoundError extends Error {
  constructor(readonly resource: 'job' | 'capacity') {
    super(`${resource} is not registered in the durable compute store`);
    this.name = 'ComputeJobStoreNotFoundError';
  }
}

export interface CreateComputeJobStoreOptions {
  readonly admissionTrustAnchors: readonly ComputeJobAdmissionTrustAnchor[];
  readonly admissionTrustPolicyDigest: string;
  /** Injectable server clock for deterministic tests. PostgreSQL is rechecked before commit. */
  readonly now?: () => string;
  readonly pool?: ComputeJobStorePool;
  readonly databaseUrl?: string;
  readonly maxTransactionRetries?: number;
}

interface IdempotencyRow extends Record<string, unknown> {
  request_digest: string;
  status: 'pending' | 'committed';
  transition_receipt_id: string | null;
  allocation_commit_receipt_id: string | null;
  admission_receipt_id: string | null;
  public_response_bytes: string | null;
}

interface JobCreationIdempotencyRow extends Record<string, unknown> {
  request_digest: string;
  status: 'pending' | 'committed';
  job_receipt_id: string | null;
  admission_receipt_id: string | null;
  public_response_bytes: string | null;
}

interface JobRow extends Record<string, unknown> {
  principal_digest: string;
  work_unit_digest: string;
  state: string;
  version: string | number;
  receipt_id: string;
  job_bytes: string;
  capacity_ref: string | null;
  lease_receipt_id: string | null;
  fencing_epoch: string | number | null;
}

interface AllocationRow extends Record<string, unknown> {
  lane: ComputeAllocationProjection['lane'];
  slot_state: ComputeCapacityAllocationCursor['slotState'];
  current_epoch: string | number;
  current_lease_receipt_id: string | null;
  version: string | number;
  etag: string;
  cursor_bytes: string;
  eligibility_bytes?: string;
  data_policy_bytes?: string;
  provider?: string;
  provider_resource_id?: string;
  eligible?: boolean;
  valid_until?: Date | string;
  data_policy_valid_until?: Date | string;
  allowed_data_classifications?: string[];
}

interface CapacityRegistrationRow extends Record<string, unknown> {
  lane: ComputeCapacityLane;
  slot_state: ComputeCapacityAllocationCursor['slotState'];
  current_epoch: string | number;
  current_lease_receipt_id: string | null;
  version: string | number;
  etag: string;
  cursor_bytes: string;
  provider: string;
  provider_resource_id: string;
  eligible: boolean;
  valid_until: Date | string;
  data_policy_valid_until: Date | string;
  allowed_data_classifications: string[];
  eligibility_bytes: string;
  data_policy_bytes: string;
}

interface CapacityRegistrationJournalRow extends Record<string, unknown> {
  lane: ComputeCapacityLane;
  initial_etag: string;
  cursor_bytes: string;
  eligibility_bytes: string;
  data_policy_bytes: string;
  registered_at: string;
}

interface AdmissionRow extends Record<string, unknown> {
  receipt_id: string;
  schema_version: string;
  issuer: string;
  key_id: string;
  principal_digest: string;
  job_id: string;
  attempt: string | number;
  operation: string;
  request_digest: string;
  work_unit_digest: string;
  data_classification: string;
  trust_policy_digest: string;
  verification_scope: string;
  provider_reservation: string;
  execution: string;
  verified_at: Date | string;
  valid_until: Date | string;
  effective_valid_until: Date | string;
  admission_bytes: string;
  operation_receipt_id?: string;
  referenced_job_id?: string;
  referenced_attempt?: string | number;
  referenced_operation?: string;
}

interface ReadbackRow extends Record<string, unknown> {
  request_digest: string;
  status: 'committed';
  public_response_bytes: string;
  transition_receipt_id: string;
  allocation_commit_receipt_id: string | null;
  admission_receipt_id: string;
  transition_bytes: string;
  to_job_bytes: string;
  commit_bytes: string | null;
  next_cursor_bytes: string | null;
  committed_next_etag: string | null;
}

interface JobCreationReadbackRow extends Record<string, unknown> {
  request_digest: string;
  status: 'committed';
  public_response_bytes: string;
  job_receipt_id: string;
  admission_receipt_id: string;
  created_job_bytes: string;
}

interface BytesRow extends Record<string, unknown> {
  id: string;
  bytes: string;
}

interface EvidenceBytesRow extends BytesRow {
  schema_version: string;
}

interface OutboxBytesRow extends BytesRow {
  aggregate_kind: string;
  aggregate_id: string;
  event_type: string;
}

interface PolicyClockRow extends Record<string, unknown> {
  admitted: boolean;
}

interface SchemaVerifyRow extends Record<string, unknown> {
  meta_ok: boolean;
  constraints_ok: boolean;
  attempts_ok: boolean;
  timestamps_ok: boolean;
  indexes_ok: boolean;
  catalog_digest: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertDigest(value: string, label: string): void {
  if (!SHA256_LABEL.test(value)) throw new TypeError(`${label} must be a sha256 label`);
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('persisted JSON cannot contain non-finite numbers');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  throw new TypeError(`persisted JSON cannot contain ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function contentDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function parseJsonObject(bytes: string, label: string): Record<string, unknown> {
  assertText(bytes, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch (error) {
    throw new TypeError(`${label} must be valid JSON: ${(error as Error).message}`);
  }
  if (!isRecord(parsed)) throw new TypeError(`${label} must encode a JSON object`);
  if (canonicalJson(parsed) !== bytes) {
    throw new TypeError(`${label} must contain exact canonical JSON bytes`);
  }
  assertNoPlaintextCustodyMaterial(parsed, label);
  return parsed;
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a canonical ISO timestamp`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new TypeError(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function dbTimestampMatches(value: Date | string | undefined, expected: string): boolean {
  if (value instanceof Date) return value.toISOString() === expected;
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === expected;
}

function parseEligibilityBytes(bytes: string, label: string): ComputeCapacityEligibilityBinding {
  const payload = parseJsonObject(bytes, label);
  if (
    payload.schemaVersion !== COMPUTE_CAPACITY_ELIGIBILITY_BINDING_SCHEMA_VERSION ||
    typeof payload.capacityRef !== 'string' ||
    !SHA256_LABEL.test(payload.capacityRef) ||
    payload.provider !== 'vast.ai' ||
    !Number.isSafeInteger(payload.instanceId) ||
    (payload.instanceId as number) < 1 ||
    payload.eligible !== true
  ) {
    throw new TypeError(`${label} is not a valid eligible capacity binding`);
  }
  canonicalTimestamp(payload.validUntil, `${label}.validUntil`);
  return payload as unknown as ComputeCapacityEligibilityBinding;
}

function parseDataPolicyBytes(bytes: string, label: string): ComputeCapacityDataPolicy {
  const payload = parseJsonObject(bytes, label);
  const classifications = payload.allowedDataClassifications;
  if (
    payload.schemaVersion !== COMPUTE_CAPACITY_DATA_POLICY_SCHEMA_VERSION ||
    typeof payload.capacityRef !== 'string' ||
    !SHA256_LABEL.test(payload.capacityRef) ||
    !Array.isArray(classifications) ||
    classifications.length === 0 ||
    classifications.some(
      (entry) => typeof entry !== 'string' || !COMPUTE_DATA_CLASSIFICATIONS.has(entry)
    ) ||
    new Set(classifications).size !== classifications.length ||
    canonicalJson(classifications) !== canonicalJson([...classifications].sort())
  ) {
    throw new TypeError(`${label} is not a valid capacity data policy`);
  }
  canonicalTimestamp(payload.validUntil, `${label}.validUntil`);
  return payload as unknown as ComputeCapacityDataPolicy;
}

function prepareWorkUnitEnvelope(
  input: ComputeWorkUnitEnvelope,
  label: string
): ComputeWorkUnitEnvelope {
  assertDigest(input.digest, `${label}.digest`);
  const payload = parseJsonObject(input.bytes, `${label}.bytes`);
  const validation = validateComputeWorkUnitContract(payload);
  if (!validation.valid) {
    throw new TypeError(`${label}.bytes is invalid: ${validation.errors.join('; ')}`);
  }
  if (canonicalJson(payload) !== canonicalJson(input.contract)) {
    throw new TypeError(`${label}.bytes do not encode the supplied WorkUnit`);
  }
  const contract = payload as unknown as ComputeWorkUnitContract;
  const digest = computeWorkUnitDigest(contract);
  if (digest !== input.digest) {
    throw new TypeError(`${label}.digest does not bind the exact WorkUnit bytes`);
  }
  return { digest, contract, bytes: input.bytes };
}

function copyAdmissionEnvelope(
  input: ComputeJobAdmissionEnvelope,
  label: string
): ComputeJobAdmissionEnvelope {
  if (!isRecord(input) || !isRecord(input.receipt) || typeof input.bytes !== 'string') {
    throw new TypeError(`${label} must contain a receipt and exact bytes`);
  }
  return {
    receipt: input.receipt as unknown as ComputeJobAdmissionReceipt,
    bytes: input.bytes,
  };
}

type StructuralEvidenceValidator = (value: unknown) => {
  readonly valid: boolean;
  readonly errors: readonly string[];
};

const STRUCTURAL_EVIDENCE_VALIDATORS = new Map<string, StructuralEvidenceValidator>([
  [COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION, validateComputeCapacitySnapshot],
  [COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION, validateComputeBridgeAdmission],
  [COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION, validateComputePlacementPlan],
  [COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION, validateComputeCapacityLease],
  [COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION, validateComputeExecutionReceipt],
  [COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION, validateComputeSubjectAttestation],
]);

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function keyNamesDigest(key: string): boolean {
  return key.endsWith('hash') || key.endsWith('digest') || key.endsWith('keyid');
}

function assertNoPlaintextCustodyMaterial(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaintextCustodyMaterial(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    if (
      typeof value === 'string' &&
      (/^Bearer\s+/i.test(value) || /^holomesh_sk_/i.test(value) || /^sk-[a-z0-9]/i.test(value))
    ) {
      throw new TypeError(`${path} contains bearer-shaped plaintext`);
    }
    return;
  }
  for (const [rawKey, entry] of Object.entries(value)) {
    const key = normalizedKey(rawKey);
    const digestNamed = keyNamesDigest(key);
    const plaintextNamed =
      key === 'token' ||
      key.endsWith('fencingtoken') ||
      key === 'idempotency' ||
      key.endsWith('idempotencykey') ||
      key.endsWith('credential') ||
      key.endsWith('credentials') ||
      key.endsWith('apikey') ||
      key.endsWith('accesstoken') ||
      key.endsWith('refreshtoken') ||
      key.endsWith('clientsecret') ||
      key.endsWith('password') ||
      key.endsWith('privatekey') ||
      key === 'authorization' ||
      key === 'bearertoken' ||
      key.endsWith('secretvalue');
    if (plaintextNamed && !digestNamed) {
      throw new TypeError(`${path}.${rawKey} may not persist plaintext custody material`);
    }
    assertNoPlaintextCustodyMaterial(entry, `${path}.${rawKey}`);
  }
}

function assertEnvelope(envelope: ComputeDurableEnvelope, label: string): Record<string, unknown> {
  assertDigest(envelope.receiptId, `${label}.receiptId`);
  assertText(envelope.schemaVersion, `${label}.schemaVersion`);
  const payload = parseJsonObject(envelope.bytes, `${label}.bytes`);
  if (payload.receiptId !== envelope.receiptId) {
    throw new TypeError(`${label}.bytes receiptId does not match its envelope`);
  }
  if (payload.schemaVersion !== envelope.schemaVersion) {
    throw new TypeError(`${label}.bytes schemaVersion does not match its envelope`);
  }
  const { receiptId: _receiptId, ...body } = payload;
  if (contentDigest(body) !== envelope.receiptId) {
    throw new TypeError(`${label}.bytes are not content-addressed by receiptId`);
  }
  const validator = STRUCTURAL_EVIDENCE_VALIDATORS.get(envelope.schemaVersion);
  if (!validator) throw new TypeError(`${label}.schemaVersion is not an admitted evidence schema`);
  const validation = validator(payload);
  if (!validation.valid) {
    throw new TypeError(`${label}.bytes are structurally invalid: ${validation.errors.join('; ')}`);
  }
  return payload;
}

function placementEvidenceSchemas(job: ComputeJobReceipt): Map<string, string> {
  return new Map([
    [job.placement.capacitySnapshotReceiptId, COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION],
    [job.placement.planReceiptId, COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION],
    ...(job.placement.bridgeAdmissionReceiptId
      ? ([
          [job.placement.bridgeAdmissionReceiptId, COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION],
        ] as const)
      : []),
  ]);
}

function expectedTransitionEvidenceSchemas(
  expectedJob: ComputeJobReceipt,
  nextJob: ComputeJobReceipt,
  transition: ComputeJobTransitionReceipt
): Map<string, string> {
  if (transition.action === 'queue') return placementEvidenceSchemas(expectedJob);
  if (transition.action === 'acquire_lease' && nextJob.lease) {
    const result = placementEvidenceSchemas(expectedJob);
    result.set(nextJob.lease.receiptId, COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION);
    return result;
  }
  if (
    (transition.action === 'start' || transition.action === 'mark_running') &&
    expectedJob.lease
  ) {
    return new Map([[expectedJob.lease.receiptId, COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION]]);
  }
  const terminalEvidence = nextJob.terminal?.evidence;
  if (terminalEvidence?.kind === 'attested_execution') {
    return new Map([
      [terminalEvidence.executionReceiptId, COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION],
      [terminalEvidence.executionAttestationReceiptId, COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION],
    ]);
  }
  return new Map();
}

function assertEvidenceBindings(
  evidence: readonly ComputeDurableEnvelope[],
  expectedSchemas: ReadonlyMap<string, string>,
  label: string
): void {
  if (evidence.length !== expectedSchemas.size) {
    throw new TypeError(`${label} must cover every lifecycle evidence receipt exactly`);
  }
  for (const [index, envelope] of evidence.entries()) {
    assertEnvelope(envelope, `${label}[${index}]`);
    const expectedSchema = expectedSchemas.get(envelope.receiptId);
    if (!expectedSchema || expectedSchema !== envelope.schemaVersion) {
      throw new TypeError(`${label}[${index}] does not match its lifecycle evidence role`);
    }
  }
}

function prepareAllocationProjection(
  projection: ComputeAllocationProjection,
  label: string
): ComputeAllocationProjection {
  assertText(projection.teamId, `${label}.teamId`);
  if (!['local_device', 'owned_fleet', 'managed_bridge'].includes(projection.lane)) {
    throw new TypeError(`${label}.lane is invalid`);
  }
  const payload = parseJsonObject(projection.bytes, `${label}.bytes`);
  const validation = validateComputeCapacityAllocationCursor(payload);
  if (!validation.valid) {
    throw new TypeError(`${label}.bytes is invalid: ${validation.errors.join('; ')}`);
  }
  if (canonicalJson(payload) !== canonicalJson(projection.cursor)) {
    throw new TypeError(`${label}.bytes do not encode the exact allocation cursor`);
  }
  return {
    teamId: projection.teamId,
    lane: projection.lane,
    cursor: payload as unknown as ComputeCapacityAllocationCursor,
    bytes: projection.bytes,
  };
}

function prepareJobProjection(job: ComputeJobProjection, label: string): ComputeJobProjection {
  assertText(job.teamId, `${label}.teamId`);
  const payload = parseJsonObject(job.bytes, `${label}.bytes`);
  const validation = validateComputeJobReceipt(payload);
  if (!validation.valid) {
    throw new TypeError(`${label}.bytes is invalid: ${validation.errors.join('; ')}`);
  }
  if (canonicalJson(payload) !== canonicalJson(job.receipt)) {
    throw new TypeError(`${label}.bytes do not encode the supplied lifecycle receipt`);
  }
  return {
    teamId: job.teamId,
    receipt: payload as unknown as ComputeJobReceipt,
    bytes: job.bytes,
  };
}

function prepareTransitionEnvelope(
  transition: ComputeTransitionEnvelope,
  label: string
): ComputeTransitionEnvelope {
  const payload = parseJsonObject(transition.bytes, `${label}.bytes`);
  const validation = validateComputeJobTransitionReceipt(payload);
  if (!validation.valid) {
    throw new TypeError(`${label}.bytes is invalid: ${validation.errors.join('; ')}`);
  }
  if (canonicalJson(payload) !== canonicalJson(transition.receipt)) {
    throw new TypeError(`${label}.bytes do not encode the supplied lifecycle receipt`);
  }
  return {
    receipt: payload as unknown as ComputeJobTransitionReceipt,
    bytes: transition.bytes,
  };
}

function prepareAllocatorCommitEnvelope(
  allocationCommit: ComputeAllocatorCommitEnvelope,
  label: string
): ComputeAllocatorCommitEnvelope {
  const payload = parseJsonObject(allocationCommit.bytes, `${label}.bytes`);
  const validation = validateComputeAllocatorCommitReceipt(payload);
  if (!validation.valid) {
    throw new TypeError(`${label}.bytes is invalid: ${validation.errors.join('; ')}`);
  }
  if (canonicalJson(payload) !== canonicalJson(allocationCommit.receipt)) {
    throw new TypeError(`${label}.bytes do not encode the supplied lifecycle receipt`);
  }
  return {
    receipt: payload as unknown as ComputeAllocatorCommitReceipt,
    bytes: allocationCommit.bytes,
  };
}

export interface BuildComputeJobPublicArtifactsInput {
  readonly job: ComputeJobReceipt;
  readonly transition?: ComputeJobTransitionReceipt;
  readonly allocationCommit?: ComputeAllocatorCommitReceipt;
}

function publicArtifactBody(input: BuildComputeJobPublicArtifactsInput): Record<string, unknown> {
  return {
    schemaVersion: COMPUTE_JOB_PUBLIC_RESPONSE_SCHEMA_VERSION,
    verificationScope: 'durable_job_state_only',
    jobId: input.job.jobId,
    attempt: input.job.attempt,
    state: input.job.state,
    jobReceiptId: input.job.receiptId,
    ...(input.transition ? { transitionReceiptId: input.transition.receiptId } : {}),
    ...(input.allocationCommit
      ? { allocationCommitReceiptId: input.allocationCommit.receiptId }
      : {}),
    providerReservation: 'not_asserted',
    execution: 'not_asserted',
  };
}

/** Build the only public response shape accepted by the durable store. */
export function buildComputeJobPublicResponseBytes(
  input: BuildComputeJobPublicArtifactsInput
): string {
  return canonicalJson(publicArtifactBody(input));
}

/** Build the only outbox event shape accepted by the durable store. */
export function buildComputeJobOutboxEnvelope(
  input: BuildComputeJobPublicArtifactsInput
): ComputeOutboxEnvelope {
  const eventType = `compute_job.${input.job.state}`;
  const body = {
    schemaVersion: COMPUTE_JOB_OUTBOX_SCHEMA_VERSION,
    verificationScope: 'durable_job_state_only',
    aggregateKind: 'compute_job',
    aggregateId: input.job.jobId,
    eventType,
    job: publicArtifactBody(input),
  };
  const eventId = contentDigest({ domain: COMPUTE_JOB_OUTBOX_SCHEMA_VERSION, event: body });
  return {
    eventId,
    aggregateKind: 'compute_job',
    aggregateId: input.job.jobId,
    eventType,
    bytes: canonicalJson({ ...body, eventId }),
  };
}

function assertPublicArtifacts(
  publicResponseBytes: string,
  outbox: readonly ComputeOutboxEnvelope[],
  input: BuildComputeJobPublicArtifactsInput
): void {
  parseJsonObject(publicResponseBytes, 'publicResponseBytes');
  if (publicResponseBytes !== buildComputeJobPublicResponseBytes(input)) {
    throw new TypeError('publicResponseBytes must be derived from the exact lifecycle receipts');
  }
  if (outbox.length !== 1) throw new TypeError('exactly one lifecycle outbox event is required');
  const expected = buildComputeJobOutboxEnvelope(input);
  const supplied = outbox[0];
  if (
    supplied.eventId !== expected.eventId ||
    supplied.aggregateKind !== expected.aggregateKind ||
    supplied.aggregateId !== expected.aggregateId ||
    supplied.eventType !== expected.eventType ||
    supplied.bytes !== expected.bytes
  ) {
    throw new TypeError('outbox event must be derived from the exact lifecycle receipts');
  }
  parseJsonObject(supplied.bytes, 'outbox[0].bytes');
}

function jobLeaseColumns(job: ComputeJobReceipt): {
  capacityRef: string | null;
  leaseReceiptId: string | null;
  fencingEpoch: number | null;
} {
  return job.lease
    ? {
        capacityRef: job.lease.capacityRef,
        leaseReceiptId: job.lease.receiptId,
        fencingEpoch: job.lease.fencingEpoch,
      }
    : { capacityRef: null, leaseReceiptId: null, fencingEpoch: null };
}

function prepareCommand(
  input: CommitComputeJobTransitionCommand
): CommitComputeJobTransitionCommand {
  const expectedJob = prepareJobProjection(input.expectedJob, 'expectedJob');
  const nextJob = prepareJobProjection(input.nextJob, 'nextJob');
  const transition = prepareTransitionEnvelope(input.transition, 'transition');
  const expectedWorkUnit = prepareWorkUnitEnvelope(input.expectedWorkUnit, 'expectedWorkUnit');
  const admission = copyAdmissionEnvelope(input.admission, 'admission');
  const allocationCount = [
    input.expectedAllocation,
    input.nextAllocation,
    input.allocationCommit,
    input.expectedCapacityEligibilityBytes,
    input.expectedCapacityDataPolicyBytes,
  ].filter((entry) => entry !== undefined).length;
  if (allocationCount !== 0 && allocationCount !== 5) {
    throw new TypeError(
      'allocation projections, allocator commit, and policy bytes must be all present or all absent'
    );
  }
  const expectedAllocation = input.expectedAllocation
    ? prepareAllocationProjection(input.expectedAllocation, 'expectedAllocation')
    : undefined;
  const nextAllocation = input.nextAllocation
    ? prepareAllocationProjection(input.nextAllocation, 'nextAllocation')
    : undefined;
  const allocationCommit = input.allocationCommit
    ? prepareAllocatorCommitEnvelope(input.allocationCommit, 'allocationCommit')
    : undefined;
  const command: CommitComputeJobTransitionCommand = {
    operation: input.operation,
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    requestDigest: input.requestDigest,
    expectedJob,
    nextJob,
    ...(expectedAllocation ? { expectedAllocation } : {}),
    ...(nextAllocation ? { nextAllocation } : {}),
    expectedWorkUnit,
    evidence: input.evidence
      .map((entry) => ({ ...entry }))
      .sort((left, right) => left.receiptId.localeCompare(right.receiptId)),
    admission,
    transition,
    ...(allocationCommit ? { allocationCommit } : {}),
    ...(input.expectedCapacityEligibilityBytes !== undefined
      ? { expectedCapacityEligibilityBytes: input.expectedCapacityEligibilityBytes }
      : {}),
    ...(input.expectedCapacityDataPolicyBytes !== undefined
      ? { expectedCapacityDataPolicyBytes: input.expectedCapacityDataPolicyBytes }
      : {}),
    outbox: input.outbox.map((entry) => ({ ...entry })),
    publicResponseBytes: input.publicResponseBytes,
  };

  const expectedOperation = `compute_job.${command.transition.receipt.action}`;
  if (command.operation !== expectedOperation) {
    throw new TypeError(`operation must be derived as ${expectedOperation}`);
  }
  assertDigest(command.idempotencyKeyDigest, 'idempotencyKeyDigest');
  assertDigest(command.requestDigest, 'requestDigest');

  const lifecycle = verifyComputeJobTransition({
    expectedJob: command.expectedJob.receipt,
    nextJob: command.nextJob.receipt,
    transition: command.transition.receipt,
    ...(command.allocationCommit ? { allocatorCommit: command.allocationCommit.receipt } : {}),
  });
  if (!lifecycle.valid) {
    throw new TypeError(
      `transition does not bind the exact lifecycle CAS: ${lifecycle.errors.join('; ')}`
    );
  }
  const requestBinding = command.transition.receipt.request;
  if (
    command.idempotencyKeyDigest !== requestBinding.idempotencyKeyHash ||
    command.idempotencyKeyDigest !== command.nextJob.receipt.request.idempotencyKeyHash ||
    command.requestDigest !== requestBinding.requestHash ||
    command.requestDigest !== command.nextJob.receipt.request.requestHash
  ) {
    throw new TypeError('command digests do not match the lifecycle request binding');
  }
  if (
    expectedWorkUnit.digest !== command.expectedJob.receipt.workUnit.digest ||
    expectedWorkUnit.digest !== command.nextJob.receipt.workUnit.digest ||
    expectedWorkUnit.contract.source_evidence !==
      command.expectedJob.receipt.workUnit.sourceEvidence ||
    expectedWorkUnit.contract.source_evidence !== command.nextJob.receipt.workUnit.sourceEvidence
  ) {
    throw new TypeError('WorkUnit bytes do not bind both lifecycle job receipts');
  }

  const evidenceIds = new Set(command.evidence.map((entry) => entry.receiptId));
  if (evidenceIds.size !== command.evidence.length) {
    throw new TypeError('evidence receipt ids must be unique');
  }
  if (
    canonicalJson([...evidenceIds].sort()) !==
    canonicalJson([...command.transition.receipt.evidenceReceiptIds].sort())
  ) {
    throw new TypeError('evidence bytes must cover the transition evidenceReceiptIds exactly');
  }
  assertEvidenceBindings(
    command.evidence,
    expectedTransitionEvidenceSchemas(
      command.expectedJob.receipt,
      command.nextJob.receipt,
      command.transition.receipt
    ),
    'evidence'
  );

  if (
    command.expectedAllocation &&
    command.nextAllocation &&
    command.allocationCommit &&
    command.expectedCapacityEligibilityBytes &&
    command.expectedCapacityDataPolicyBytes
  ) {
    const allocator = command.allocationCommit.receipt;
    const eligibility = parseEligibilityBytes(
      command.expectedCapacityEligibilityBytes,
      'expectedCapacityEligibilityBytes'
    );
    const dataPolicy = parseDataPolicyBytes(
      command.expectedCapacityDataPolicyBytes,
      'expectedCapacityDataPolicyBytes'
    );
    const workUnit = command.expectedWorkUnit;
    if (
      command.expectedAllocation.teamId !== command.expectedJob.teamId ||
      command.nextAllocation.teamId !== command.expectedJob.teamId ||
      command.expectedAllocation.lane !== command.nextAllocation.lane ||
      canonicalJson(command.expectedAllocation.cursor) !==
        canonicalJson(allocator.expectedAllocation) ||
      canonicalJson(command.nextAllocation.cursor) !== canonicalJson(allocator.nextAllocation) ||
      eligibility.capacityRef !== allocator.capacityRef ||
      dataPolicy.capacityRef !== allocator.capacityRef
    ) {
      throw new TypeError('allocation projections do not bind the lifecycle allocator receipt');
    }
    if (
      !dataPolicy.allowedDataClassifications.includes(
        workUnit.contract.compute.policy.dataClassification
      )
    ) {
      throw new TypeError('WorkUnit data classification is not admitted by capacity policy');
    }
    const leaseLane =
      command.expectedJob.receipt.lease?.lane ?? command.nextJob.receipt.lease?.lane;
    if (!leaseLane || command.expectedAllocation.lane !== leaseLane) {
      throw new TypeError('allocation lane does not match the lifecycle lease');
    }
    if (
      allocator.operation === 'acquire' &&
      (!eligibility.eligible ||
        Date.parse(eligibility.validUntil) <= Date.parse(command.transition.receipt.transitionedAt))
    ) {
      throw new TypeError('allocator acquire requires a current eligible capacity binding');
    }
    if (
      allocator.operation === 'acquire' &&
      Date.parse(dataPolicy.validUntil) <= Date.parse(command.transition.receipt.transitionedAt)
    ) {
      throw new TypeError('allocator acquire requires a current capacity data policy');
    }
  }

  assertPublicArtifacts(command.publicResponseBytes, command.outbox, {
    job: command.nextJob.receipt,
    transition: command.transition.receipt,
    ...(command.allocationCommit ? { allocationCommit: command.allocationCommit.receipt } : {}),
  });
  return command;
}

function prepareCapacityRegistration(
  input: RegisterComputeCapacityCommand
): RegisterComputeCapacityCommand {
  const projection = prepareAllocationProjection(input.projection, 'projection');
  const eligibility = parseEligibilityBytes(input.eligibilityBytes, 'eligibilityBytes');
  const dataPolicy = parseDataPolicyBytes(input.dataPolicyBytes, 'dataPolicyBytes');
  if (canonicalJson(eligibility) !== canonicalJson(input.eligibility)) {
    throw new TypeError('eligibilityBytes do not encode the supplied server-local binding');
  }
  if (canonicalJson(dataPolicy) !== canonicalJson(input.dataPolicy)) {
    throw new TypeError('dataPolicyBytes do not encode the supplied capacity policy');
  }
  const registeredAt = canonicalTimestamp(input.registeredAt, 'registeredAt');
  if (
    projection.cursor.slotState !== 'available' ||
    projection.cursor.currentEpoch !== 0 ||
    projection.cursor.version !== 0
  ) {
    throw new TypeError('capacity registration requires an initial available allocation cursor');
  }
  if (
    eligibility.capacityRef !== projection.cursor.capacityRef ||
    dataPolicy.capacityRef !== projection.cursor.capacityRef ||
    Date.parse(eligibility.validUntil) <= Date.parse(registeredAt) ||
    Date.parse(dataPolicy.validUntil) <= Date.parse(registeredAt)
  ) {
    throw new TypeError('capacity eligibility must bind the cursor and outlive registration');
  }
  return {
    projection,
    eligibility: { ...eligibility },
    eligibilityBytes: input.eligibilityBytes,
    dataPolicy: {
      ...dataPolicy,
      allowedDataClassifications: [...dataPolicy.allowedDataClassifications],
    },
    dataPolicyBytes: input.dataPolicyBytes,
    registeredAt,
  };
}

function prepareCreateJobCommand(input: CreateComputeJobCommand): CreateComputeJobCommand {
  const job = prepareJobProjection(input.job, 'job');
  const workUnit = prepareWorkUnitEnvelope(input.workUnit, 'workUnit');
  const admission = copyAdmissionEnvelope(input.admission, 'admission');
  const receipt = job.receipt;
  if (input.operation !== 'compute_job.create') {
    throw new TypeError('operation must be derived as compute_job.create');
  }
  assertDigest(input.idempotencyKeyDigest, 'idempotencyKeyDigest');
  assertDigest(input.requestDigest, 'requestDigest');
  if (receipt.version !== 0 || receipt.state !== 'preflighted' || receipt.lease !== undefined) {
    throw new TypeError('createJob accepts only an initial preflighted lifecycle receipt');
  }
  if (
    workUnit.digest !== receipt.workUnit.digest ||
    workUnit.contract.source_evidence !== receipt.workUnit.sourceEvidence
  ) {
    throw new TypeError('WorkUnit bytes do not bind the initial lifecycle job receipt');
  }

  const evidence = input.evidence
    .map((entry) => ({ ...entry }))
    .sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  const evidenceIds = evidence.map((entry) => entry.receiptId);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new TypeError('evidence receipt ids must be unique');
  }
  const expectedEvidenceIds = [
    receipt.placement.capacitySnapshotReceiptId,
    receipt.placement.planReceiptId,
    ...(receipt.placement.bridgeAdmissionReceiptId
      ? [receipt.placement.bridgeAdmissionReceiptId]
      : []),
  ].sort();
  if (canonicalJson([...evidenceIds].sort()) !== canonicalJson(expectedEvidenceIds)) {
    throw new TypeError('create evidence bytes must cover the placement receipt IDs exactly');
  }
  assertEvidenceBindings(evidence, placementEvidenceSchemas(receipt), 'evidence');
  const requestDigest = computeJobRequestHash({
    schemaVersion: COMPUTE_JOB_REQUEST_SCHEMA_VERSION,
    operation: 'create',
    principalDigest: receipt.principalDigest,
    jobId: receipt.jobId,
    attempt: receipt.attempt,
    evidenceReceiptIds: expectedEvidenceIds,
  });
  if (
    input.idempotencyKeyDigest !== receipt.request.idempotencyKeyHash ||
    input.requestDigest !== receipt.request.requestHash ||
    input.requestDigest !== requestDigest
  ) {
    throw new TypeError('create command digests do not match the lifecycle request binding');
  }

  const outbox = input.outbox.map((entry) => ({ ...entry }));
  assertPublicArtifacts(input.publicResponseBytes, outbox, { job: receipt });

  return {
    operation: input.operation,
    idempotencyKeyDigest: input.idempotencyKeyDigest,
    requestDigest: input.requestDigest,
    job,
    workUnit,
    evidence,
    admission,
    outbox,
    publicResponseBytes: input.publicResponseBytes,
  };
}

function asSafeInteger(value: string | number | null, label: string): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ComputeJobStoreConflictError('immutable_receipt_conflict', `${label} is invalid`);
  }
  return parsed;
}

function nullable(value: string | undefined): string | null {
  return value ?? null;
}

function admissionRowMatches(
  row: AdmissionRow,
  admission: ComputeJobAdmissionEnvelope,
  effectiveValidUntil: string
): boolean {
  const receipt = admission.receipt;
  return (
    row.receipt_id === receipt.receiptId &&
    row.schema_version === receipt.schemaVersion &&
    row.issuer === receipt.issuer &&
    row.key_id === receipt.keyId &&
    row.principal_digest === receipt.principalDigest &&
    row.job_id === receipt.jobId &&
    asSafeInteger(row.attempt, 'admission.attempt') === receipt.attempt &&
    row.operation === receipt.operation &&
    row.request_digest === receipt.requestDigest &&
    row.work_unit_digest === receipt.workUnitDigest &&
    row.data_classification === receipt.dataClassification &&
    row.trust_policy_digest === receipt.trustPolicyDigest &&
    row.verification_scope === receipt.verificationScope &&
    row.provider_reservation === receipt.providerReservation &&
    row.execution === receipt.execution &&
    dbTimestampMatches(row.verified_at, receipt.verifiedAt) &&
    dbTimestampMatches(row.valid_until, receipt.validUntil) &&
    dbTimestampMatches(row.effective_valid_until, effectiveValidUntil) &&
    row.admission_bytes === admission.bytes
  );
}

function rowCount(result: QueryResultLike): number {
  return result.rowCount ?? result.rows.length;
}

function sqlState(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

async function rollbackQuietly(client: ComputeJobStoreClient): Promise<void> {
  try {
    await client.query('/* compute:rollback */ ROLLBACK');
  } catch {
    // Preserve the original transaction error.
  }
}

export class PostgresComputeJobStore {
  private constructor(
    private readonly pool: ComputeJobStorePool,
    private readonly ownsPool: boolean,
    private readonly maxTransactionRetries: number,
    private readonly admissionTrustAnchors: readonly ComputeJobAdmissionTrustAnchor[],
    private readonly admissionTrustPolicyDigest: string,
    private readonly now: () => string
  ) {}

  static async create(options: CreateComputeJobStoreOptions): Promise<PostgresComputeJobStore> {
    if (
      !Array.isArray(options.admissionTrustAnchors) ||
      options.admissionTrustAnchors.length === 0
    ) {
      throw new TypeError('at least one admissionTrustAnchor is required');
    }
    assertDigest(options.admissionTrustPolicyDigest, 'admissionTrustPolicyDigest');
    const now = options.now ?? (() => new Date().toISOString());
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    canonicalTimestamp(now(), 'now()');
    const admissionTrustAnchors = Object.freeze(
      options.admissionTrustAnchors.map((anchor) =>
        Object.freeze({
          ...anchor,
          allowedTeamIds: Object.freeze([...anchor.allowedTeamIds]),
          allowedPrincipalDigests: Object.freeze([...anchor.allowedPrincipalDigests]),
          allowedTrustPolicyDigests: Object.freeze([...anchor.allowedTrustPolicyDigests]),
        })
      )
    );
    let pool = options.pool;
    let ownsPool = false;
    if (!pool) {
      const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new ComputeJobStoreUnavailableError(
          'DATABASE_URL or an injected PostgreSQL Pool is required for compute custody'
        );
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Pool } = require('pg') as {
          Pool: new (
            options: ReturnType<typeof createHoloMeshPostgresPoolOptions>
          ) => ComputeJobStorePool;
        };
        pool = new Pool(createHoloMeshPostgresPoolOptions(databaseUrl));
        ownsPool = true;
      } catch (error) {
        throw new ComputeJobStoreUnavailableError(
          'PostgreSQL compute store could not load pg',
          error
        );
      }
    }

    const retries = options.maxTransactionRetries ?? DEFAULT_MAX_TRANSACTION_RETRIES;
    assertNonnegativeInteger(retries, 'maxTransactionRetries');
    if (retries > MAX_TRANSACTION_RETRIES) {
      throw new TypeError(`maxTransactionRetries cannot exceed ${MAX_TRANSACTION_RETRIES}`);
    }
    const store = new PostgresComputeJobStore(
      pool,
      ownsPool,
      retries,
      admissionTrustAnchors,
      options.admissionTrustPolicyDigest,
      now
    );
    try {
      await store.initialize();
      return store;
    } catch (error) {
      if (ownsPool) await pool.end?.().catch(() => undefined);
      if (error instanceof ComputeJobStoreUnavailableError) throw error;
      throw new ComputeJobStoreUnavailableError(
        'PostgreSQL compute schema initialization failed',
        error
      );
    }
  }

  private async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(COMPUTE_JOB_STORE_SCHEMA_SQL);
      const verification = await client.query<SchemaVerifyRow>(COMPUTE_JOB_STORE_SCHEMA_VERIFY_SQL);
      const row = verification.rows[0];
      if (
        verification.rows.length !== 1 ||
        row.meta_ok !== true ||
        row.constraints_ok !== true ||
        row.attempts_ok !== true ||
        row.timestamps_ok !== true ||
        row.indexes_ok !== true ||
        row.catalog_digest !== COMPUTE_JOB_STORE_CATALOG_DIGEST
      ) {
        throw new Error('compute custody schema catalog verification failed');
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end?.();
  }

  private verificationTime(): string {
    return canonicalTimestamp(this.now(), 'now()');
  }

  private authenticateAdmission(input: {
    readonly admission: ComputeJobAdmissionEnvelope;
    readonly teamId: string;
    readonly principalDigest: string;
    readonly jobId: string;
    readonly attempt: number;
    readonly operation: ComputeJobAdmissionReceipt['operation'];
    readonly requestDigest: string;
    readonly workUnit: ComputeWorkUnitEnvelope;
    readonly evidence: readonly ComputeDurableEnvelope[];
    readonly lifecycle: ComputeJobAdmissionReceipt['lifecycle'];
  }): ComputeJobAdmissionEnvelope {
    const verification = verifyComputeJobAdmission({
      receipt: input.admission.receipt,
      receiptBytes: input.admission.bytes,
      evidence: input.evidence,
      workUnit: input.workUnit.contract,
      expected: {
        teamId: input.teamId,
        principalDigest: input.principalDigest,
        jobId: input.jobId,
        attempt: input.attempt,
        operation: input.operation,
        requestDigest: input.requestDigest,
        trustPolicyDigest: this.admissionTrustPolicyDigest,
        lifecycle: input.lifecycle,
      },
      trustAnchors: this.admissionTrustAnchors,
      at: this.verificationTime(),
    });
    if (!verification.valid) {
      throw new ComputeJobStoreAdmissionError(verification.reasonCodes);
    }
    return {
      receipt: verification.receipt,
      bytes: verification.canonicalReceiptBytes,
    };
  }

  private async assertAdmissionCurrentAtDatabaseClock(
    client: ComputeJobStoreClient,
    admission: ComputeJobAdmissionEnvelope
  ): Promise<void> {
    const clock = await client.query<PolicyClockRow>(
      `/* compute:admission-policy-clock */
       SELECT (
         $1::timestamptz <= clock_timestamp() + INTERVAL '60 seconds' AND
         $2::timestamptz > clock_timestamp()
       ) AS admitted`,
      [admission.receipt.verifiedAt, this.admissionEffectiveValidUntil(admission)]
    );
    if (clock.rows.length !== 1 || clock.rows[0].admitted !== true) {
      throw new ComputeJobStoreAdmissionError(['admission_expired_at_database_clock']);
    }
  }

  private admissionEffectiveValidUntil(admission: ComputeJobAdmissionEnvelope): string {
    const anchors = this.admissionTrustAnchors.filter(
      (anchor) =>
        anchor.issuer === admission.receipt.issuer && anchor.keyId === admission.receipt.keyId
    );
    if (anchors.length !== 1) {
      throw new ComputeJobStoreAdmissionError(['admission_anchor_not_unique']);
    }
    const anchor = anchors[0];
    const candidates = [
      admission.receipt.validUntil,
      anchor.validUntil,
      ...(anchor.revokedAt ? [anchor.revokedAt] : []),
    ].map((value) => Date.parse(canonicalTimestamp(value, 'admission authority expiry')));
    return new Date(Math.min(...candidates)).toISOString();
  }

  private async persistAdmission(
    client: ComputeJobStoreClient,
    input: {
      readonly teamId: string;
      readonly jobId: string;
      readonly attempt: number;
      readonly operationReceiptId: string;
      readonly admission: ComputeJobAdmissionEnvelope;
    }
  ): Promise<void> {
    const receipt = input.admission.receipt;
    const effectiveValidUntil = this.admissionEffectiveValidUntil(input.admission);
    const inserted = await client.query(
      `/* compute:admission-insert */
       INSERT INTO holomesh_compute_admissions
         (team_id, receipt_id, schema_version, issuer, key_id, principal_digest,
          job_id, attempt, operation, request_digest, work_unit_digest,
          data_classification, trust_policy_digest, verification_scope,
          provider_reservation, execution, verified_at, valid_until,
          effective_valid_until, admission_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (team_id, receipt_id) DO NOTHING
       RETURNING receipt_id`,
      [
        input.teamId,
        receipt.receiptId,
        receipt.schemaVersion,
        receipt.issuer,
        receipt.keyId,
        receipt.principalDigest,
        receipt.jobId,
        receipt.attempt,
        receipt.operation,
        receipt.requestDigest,
        receipt.workUnitDigest,
        receipt.dataClassification,
        receipt.trustPolicyDigest,
        receipt.verificationScope,
        receipt.providerReservation,
        receipt.execution,
        receipt.verifiedAt,
        receipt.validUntil,
        effectiveValidUntil,
        input.admission.bytes,
      ]
    );
    if (rowCount(inserted) === 0) {
      const existing = await client.query<AdmissionRow>(
        `/* compute:admission-lock */
         SELECT receipt_id, schema_version, issuer, key_id, principal_digest,
                job_id, attempt, operation, request_digest, work_unit_digest,
                data_classification, trust_policy_digest, verification_scope,
                provider_reservation, execution, verified_at, valid_until,
                effective_valid_until, admission_bytes
         FROM holomesh_compute_admissions
         WHERE team_id = $1 AND receipt_id = $2
         FOR UPDATE`,
        [input.teamId, receipt.receiptId]
      );
      if (
        existing.rows.length !== 1 ||
        !admissionRowMatches(existing.rows[0], input.admission, effectiveValidUntil)
      ) {
        throw new ComputeJobStoreConflictError(
          'immutable_receipt_conflict',
          `admission ${receipt.receiptId} already has different bytes`
        );
      }
    }

    const reference = await client.query(
      `/* compute:admission-ref-insert */
       INSERT INTO holomesh_compute_admission_refs
         (team_id, job_id, attempt, operation, operation_receipt_id, admission_receipt_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING admission_receipt_id`,
      [
        input.teamId,
        input.jobId,
        input.attempt,
        receipt.operation,
        input.operationReceiptId,
        receipt.receiptId,
      ]
    );
    if (rowCount(reference) !== 1) {
      throw new ComputeJobStoreConflictError(
        'immutable_receipt_conflict',
        `operation ${input.operationReceiptId} already has a different admission reference`
      );
    }
  }

  private async readBackAdmission(
    client: ComputeJobStoreClient,
    teamId: string,
    operationReceiptId: string,
    admission: ComputeJobAdmissionEnvelope
  ): Promise<string> {
    const effectiveValidUntil = this.admissionEffectiveValidUntil(admission);
    const result = await client.query<AdmissionRow>(
      `/* compute:admission-readback */
       SELECT a.receipt_id, a.schema_version, a.issuer, a.key_id,
              a.principal_digest, a.job_id, a.attempt, a.operation,
              a.request_digest, a.work_unit_digest, a.data_classification,
              a.trust_policy_digest, a.verification_scope,
              a.provider_reservation, a.execution, a.verified_at, a.valid_until,
              a.effective_valid_until, a.admission_bytes, r.operation_receipt_id,
              r.job_id AS referenced_job_id, r.attempt AS referenced_attempt,
              r.operation AS referenced_operation
       FROM holomesh_compute_admissions a
       JOIN holomesh_compute_admission_refs r
         ON r.team_id = a.team_id AND r.admission_receipt_id = a.receipt_id
       WHERE a.team_id = $1 AND r.operation_receipt_id = $2`,
      [teamId, operationReceiptId]
    );
    if (
      result.rows.length !== 1 ||
      result.rows[0].operation_receipt_id !== operationReceiptId ||
      result.rows[0].referenced_job_id !== admission.receipt.jobId ||
      asSafeInteger(result.rows[0].referenced_attempt ?? null, 'admission-ref.attempt') !==
        admission.receipt.attempt ||
      result.rows[0].referenced_operation !== admission.receipt.operation ||
      !admissionRowMatches(result.rows[0], admission, effectiveValidUntil)
    ) {
      throw new ComputeJobStoreReadbackError(
        'committed authenticated admission bytes did not read back exactly'
      );
    }
    return result.rows[0].receipt_id;
  }

  async readJob(input: ReadComputeJobInput): Promise<ComputeJobProjection> {
    assertText(input.teamId, 'teamId');
    assertDigest(input.jobId, 'jobId');
    assertPositiveInteger(input.attempt, 'attempt');
    const client = await this.pool.connect();
    try {
      const result = await client.query<JobRow>(
        `/* compute:job-read */
         SELECT principal_digest, work_unit_digest, state, version, receipt_id, job_bytes, capacity_ref,
                lease_receipt_id, fencing_epoch
         FROM holomesh_compute_jobs
         WHERE team_id = $1 AND job_id = $2 AND attempt = $3`,
        [input.teamId, input.jobId, input.attempt]
      );
      if (result.rows.length !== 1) throw new ComputeJobStoreNotFoundError('job');
      const row = result.rows[0];
      const payload = parseJsonObject(row.job_bytes, 'job-read.job_bytes');
      const projection = prepareJobProjection(
        {
          teamId: input.teamId,
          receipt: payload as unknown as ComputeJobReceipt,
          bytes: row.job_bytes,
        },
        'job-read'
      );
      if (
        projection.receipt.jobId !== input.jobId ||
        projection.receipt.attempt !== input.attempt ||
        !this.jobMatches(row, projection)
      ) {
        throw new ComputeJobStoreReadbackError('durable job columns do not match exact job bytes');
      }
      return projection;
    } finally {
      client.release();
    }
  }

  async readRegisteredCapacity(
    input: ReadRegisteredComputeCapacityInput
  ): Promise<RegisteredComputeCapacity> {
    assertText(input.teamId, 'teamId');
    assertDigest(input.capacityRef, 'capacityRef');
    const client = await this.pool.connect();
    try {
      const result = await client.query<CapacityRegistrationRow>(
        `/* compute:capacity-read */
         SELECT a.lane, a.slot_state, a.current_epoch, a.current_lease_receipt_id,
                a.version, a.etag, a.cursor_bytes, b.provider,
                b.provider_resource_id, b.eligible, b.valid_until,
                b.data_policy_valid_until, b.allowed_data_classifications,
                b.eligibility_bytes, b.data_policy_bytes
         FROM holomesh_compute_allocations a
         JOIN holomesh_compute_capacity_bindings b
           ON b.team_id = a.team_id AND b.capacity_ref = a.capacity_ref
         WHERE a.team_id = $1 AND a.capacity_ref = $2`,
        [input.teamId, input.capacityRef]
      );
      if (result.rows.length !== 1) throw new ComputeJobStoreNotFoundError('capacity');
      const row = result.rows[0];
      const cursorPayload = parseJsonObject(row.cursor_bytes, 'capacity-read.cursor_bytes');
      const projection = prepareAllocationProjection(
        {
          teamId: input.teamId,
          lane: row.lane,
          cursor: cursorPayload as unknown as ComputeCapacityAllocationCursor,
          bytes: row.cursor_bytes,
        },
        'capacity-read'
      );
      const eligibility = parseEligibilityBytes(
        row.eligibility_bytes,
        'capacity-read.eligibility_bytes'
      );
      const dataPolicy = parseDataPolicyBytes(
        row.data_policy_bytes,
        'capacity-read.data_policy_bytes'
      );
      if (
        projection.cursor.capacityRef !== input.capacityRef ||
        row.slot_state !== projection.cursor.slotState ||
        asSafeInteger(row.current_epoch, 'capacity-read.current_epoch') !==
          projection.cursor.currentEpoch ||
        row.current_lease_receipt_id !== nullable(projection.cursor.currentLeaseReceiptId) ||
        asSafeInteger(row.version, 'capacity-read.version') !== projection.cursor.version ||
        row.etag !== projection.cursor.etag ||
        eligibility.capacityRef !== input.capacityRef ||
        dataPolicy.capacityRef !== input.capacityRef ||
        row.provider !== eligibility.provider ||
        row.provider_resource_id !== String(eligibility.instanceId) ||
        row.eligible !== eligibility.eligible ||
        !dbTimestampMatches(row.valid_until, eligibility.validUntil) ||
        !dbTimestampMatches(row.data_policy_valid_until, dataPolicy.validUntil) ||
        canonicalJson(row.allowed_data_classifications) !==
          canonicalJson(dataPolicy.allowedDataClassifications)
      ) {
        throw new ComputeJobStoreReadbackError(
          'durable capacity columns do not match exact registered bytes'
        );
      }
      return {
        projection,
        eligibility,
        eligibilityBytes: row.eligibility_bytes,
        dataPolicy,
        dataPolicyBytes: row.data_policy_bytes,
      };
    } finally {
      client.release();
    }
  }

  async registerCapacity(
    input: RegisterComputeCapacityCommand
  ): Promise<RegisterComputeCapacityResult> {
    const command = prepareCapacityRegistration(input);
    let retry = 0;
    while (true) {
      try {
        return await this.registerCapacityOnce(command);
      } catch (error) {
        if (RETRYABLE_SQL_STATES.has(sqlState(error) ?? '') && retry < this.maxTransactionRetries) {
          retry += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async registerCapacityOnce(
    command: RegisterComputeCapacityCommand
  ): Promise<RegisterComputeCapacityResult> {
    const client = await this.pool.connect();
    let committed = false;
    let disposition: RegisterComputeCapacityResult['disposition'] = 'committed';
    const projection = command.projection;
    const cursor = projection.cursor;
    const eligibility = command.eligibility;
    try {
      await client.query('/* compute:begin */ BEGIN ISOLATION LEVEL SERIALIZABLE');
      const lockKeys = [
        `capacity:${projection.teamId}:${cursor.capacityRef}`,
        `provider-resource:${projection.teamId}:${eligibility.provider}:${eligibility.instanceId}`,
      ].sort();
      await client.query(
        `/* compute:capacity-register-lock */
         SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
         FROM unnest($1::text[]) AS lock_key
         ORDER BY lock_key`,
        [lockKeys]
      );
      const existing = await client.query<CapacityRegistrationRow>(
        `/* compute:capacity-registration-lock */
         SELECT a.lane, a.slot_state, a.current_epoch, a.current_lease_receipt_id,
                a.version, a.etag, a.cursor_bytes, b.provider,
                b.provider_resource_id, b.eligible, b.valid_until,
                b.data_policy_valid_until, b.allowed_data_classifications,
                b.eligibility_bytes, b.data_policy_bytes
         FROM holomesh_compute_allocations a
         JOIN holomesh_compute_capacity_bindings b
           ON b.team_id = a.team_id AND b.capacity_ref = a.capacity_ref
         WHERE a.team_id = $1 AND a.capacity_ref = $2
         FOR UPDATE OF a, b`,
        [projection.teamId, cursor.capacityRef]
      );
      if (existing.rows.length > 1) {
        throw new ComputeJobStoreConflictError(
          'capacity_registration_conflict',
          'capacity registration is not unique'
        );
      }
      const policyClock = await client.query<PolicyClockRow>(
        `/* compute:capacity-policy-clock */
         SELECT (
           $1::timestamptz > clock_timestamp() AND
           $2::timestamptz > clock_timestamp() AND
           $3::timestamptz <= clock_timestamp() + INTERVAL '60 seconds'
         ) AS admitted`,
        [eligibility.validUntil, command.dataPolicy.validUntil, command.registeredAt]
      );
      if (policyClock.rows.length !== 1 || policyClock.rows[0].admitted !== true) {
        throw new ComputeJobStoreConflictError(
          'capacity_registration_conflict',
          'capacity eligibility or data policy is expired at the database clock'
        );
      }
      if (existing.rows.length === 1) {
        if (!this.capacityRegistrationMatches(existing.rows[0], command)) {
          throw new ComputeJobStoreConflictError(
            'capacity_registration_conflict',
            'capacityRef or provider resource is already bound to different exact bytes'
          );
        }
        disposition = 'replayed';
      } else {
        const allocationInsert = await client.query(
          `/* compute:capacity-insert */
           INSERT INTO holomesh_compute_allocations
             (team_id, capacity_ref, lane, slot_state, current_epoch,
              current_lease_receipt_id, version, etag, cursor_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (team_id, capacity_ref) DO NOTHING
           RETURNING etag`,
          [
            projection.teamId,
            cursor.capacityRef,
            projection.lane,
            cursor.slotState,
            cursor.currentEpoch,
            nullable(cursor.currentLeaseReceiptId),
            cursor.version,
            cursor.etag,
            projection.bytes,
          ]
        );
        if (rowCount(allocationInsert) !== 1) {
          throw new ComputeJobStoreConflictError(
            'capacity_registration_conflict',
            'capacity allocation registration lost a create-only race'
          );
        }
        const bindingInsert = await client.query(
          `/* compute:capacity-binding-insert */
           INSERT INTO holomesh_compute_capacity_bindings
              (team_id, capacity_ref, provider, provider_resource_id,
              eligible, valid_until, data_policy_valid_until,
              allowed_data_classifications, eligibility_bytes, data_policy_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT DO NOTHING
           RETURNING capacity_ref`,
          [
            projection.teamId,
            cursor.capacityRef,
            eligibility.provider,
            String(eligibility.instanceId),
            eligibility.eligible,
            eligibility.validUntil,
            command.dataPolicy.validUntil,
            [...command.dataPolicy.allowedDataClassifications],
            command.eligibilityBytes,
            command.dataPolicyBytes,
          ]
        );
        if (rowCount(bindingInsert) !== 1) {
          throw new ComputeJobStoreConflictError(
            'capacity_registration_conflict',
            'provider resource is already bound to another capacityRef'
          );
        }
      }

      await client.query(
        `/* compute:capacity-registration-journal-insert */
         INSERT INTO holomesh_compute_capacity_registrations
           (team_id, capacity_ref, lane, initial_etag, cursor_bytes,
            eligibility_bytes, data_policy_bytes, registered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (team_id, capacity_ref) DO NOTHING
         RETURNING capacity_ref`,
        [
          projection.teamId,
          cursor.capacityRef,
          projection.lane,
          cursor.etag,
          projection.bytes,
          command.eligibilityBytes,
          command.dataPolicyBytes,
          command.registeredAt,
        ]
      );
      const registrationJournal = await client.query<CapacityRegistrationJournalRow>(
        `/* compute:capacity-registration-journal-lock */
         SELECT lane, initial_etag, cursor_bytes, eligibility_bytes,
                data_policy_bytes, registered_at
         FROM holomesh_compute_capacity_registrations
         WHERE team_id = $1 AND capacity_ref = $2
         FOR UPDATE`,
        [projection.teamId, cursor.capacityRef]
      );
      if (
        registrationJournal.rows.length !== 1 ||
        !this.capacityRegistrationJournalMatches(registrationJournal.rows[0], command)
      ) {
        throw new ComputeJobStoreConflictError(
          'capacity_registration_conflict',
          'capacity registration journal binds different exact bytes'
        );
      }

      const finalPolicyClock = await client.query<PolicyClockRow>(
        `/* compute:capacity-registration-final-clock */
         UPDATE holomesh_compute_capacity_registrations
         SET committed_at = committed_at
         WHERE team_id = $1 AND capacity_ref = $2
           AND $3::timestamptz > clock_timestamp()
           AND $4::timestamptz > clock_timestamp()
           AND $5::timestamptz <= clock_timestamp() + INTERVAL '60 seconds'
         RETURNING TRUE AS admitted`,
        [
          projection.teamId,
          cursor.capacityRef,
          eligibility.validUntil,
          command.dataPolicy.validUntil,
          command.registeredAt,
        ]
      );
      if (rowCount(finalPolicyClock) !== 1 || finalPolicyClock.rows[0]?.admitted !== true) {
        throw new ComputeJobStoreConflictError(
          'capacity_registration_conflict',
          'capacity eligibility or data policy expired before the final database commit gate'
        );
      }

      await client.query('/* compute:commit */ COMMIT');
      committed = true;
      const readback = await client.query<CapacityRegistrationJournalRow>(
        `/* compute:capacity-registration-readback */
         SELECT lane, initial_etag, cursor_bytes, eligibility_bytes,
                data_policy_bytes, registered_at
         FROM holomesh_compute_capacity_registrations
         WHERE team_id = $1 AND capacity_ref = $2`,
        [projection.teamId, cursor.capacityRef]
      );
      if (
        readback.rows.length !== 1 ||
        !this.capacityRegistrationJournalMatches(readback.rows[0], command)
      ) {
        throw new ComputeJobStoreReadbackError(
          'committed capacity registration bytes did not read back exactly'
        );
      }
      return {
        disposition,
        capacityRef: cursor.capacityRef,
        lane: projection.lane,
        etag: cursor.etag,
        cursorBytes: projection.bytes,
      };
    } catch (error) {
      if (!committed) await rollbackQuietly(client);
      if (committed && !(error instanceof ComputeJobStoreReadbackError)) {
        throw new ComputeJobStoreReadbackError(
          `committed capacity registration readback failed: ${(error as Error).message}`
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private capacityRegistrationMatches(
    row: CapacityRegistrationRow,
    command: RegisterComputeCapacityCommand
  ): boolean {
    const projection = command.projection;
    const cursor = projection.cursor;
    const eligibility = command.eligibility;
    return (
      row.lane === projection.lane &&
      row.slot_state === cursor.slotState &&
      asSafeInteger(row.current_epoch, 'capacity.current_epoch') === cursor.currentEpoch &&
      row.current_lease_receipt_id === nullable(cursor.currentLeaseReceiptId) &&
      asSafeInteger(row.version, 'capacity.version') === cursor.version &&
      row.etag === cursor.etag &&
      row.cursor_bytes === projection.bytes &&
      row.provider === eligibility.provider &&
      row.provider_resource_id === String(eligibility.instanceId) &&
      row.eligible === eligibility.eligible &&
      dbTimestampMatches(row.valid_until, eligibility.validUntil) &&
      dbTimestampMatches(row.data_policy_valid_until, command.dataPolicy.validUntil) &&
      canonicalJson(row.allowed_data_classifications) ===
        canonicalJson(command.dataPolicy.allowedDataClassifications) &&
      row.eligibility_bytes === command.eligibilityBytes &&
      row.data_policy_bytes === command.dataPolicyBytes
    );
  }

  private capacityRegistrationJournalMatches(
    row: CapacityRegistrationJournalRow,
    command: RegisterComputeCapacityCommand
  ): boolean {
    return (
      row.lane === command.projection.lane &&
      row.initial_etag === command.projection.cursor.etag &&
      row.cursor_bytes === command.projection.bytes &&
      row.eligibility_bytes === command.eligibilityBytes &&
      row.data_policy_bytes === command.dataPolicyBytes &&
      row.registered_at === command.registeredAt
    );
  }

  async createJob(input: CreateComputeJobCommand): Promise<CreateComputeJobResult> {
    const prepared = prepareCreateJobCommand(input);
    const command: CreateComputeJobCommand = {
      ...prepared,
      admission: this.authenticateAdmission({
        admission: prepared.admission,
        teamId: prepared.job.teamId,
        principalDigest: prepared.job.receipt.principalDigest,
        jobId: prepared.job.receipt.jobId,
        attempt: prepared.job.receipt.attempt,
        operation: 'compute_job.create',
        requestDigest: prepared.requestDigest,
        workUnit: prepared.workUnit,
        evidence: prepared.evidence,
        lifecycle: {
          kind: 'create',
          createdJobReceiptId: prepared.job.receipt.receiptId,
        },
      }),
    };
    let retry = 0;
    while (true) {
      try {
        return await this.createJobOnce(command);
      } catch (error) {
        if (RETRYABLE_SQL_STATES.has(sqlState(error) ?? '') && retry < this.maxTransactionRetries) {
          retry += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async createJobOnce(command: CreateComputeJobCommand): Promise<CreateComputeJobResult> {
    const client = await this.pool.connect();
    let committed = false;
    let disposition: CreateComputeJobResult['disposition'] = 'committed';
    const job = command.job.receipt;
    const idempotencyKey = [
      command.job.teamId,
      job.principalDigest,
      command.operation,
      command.idempotencyKeyDigest,
    ];
    try {
      await client.query('/* compute:begin */ BEGIN ISOLATION LEVEL SERIALIZABLE');
      const insertedIdempotency = await client.query(
        `/* compute:job-create-idempotency-insert */
         INSERT INTO holomesh_compute_job_creation_idempotency
           (team_id, principal_digest, operation, key_digest, request_digest,
            status, job_id, attempt)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
         ON CONFLICT (team_id, principal_digest, operation, key_digest) DO NOTHING
         RETURNING key_digest`,
        [...idempotencyKey, command.requestDigest, job.jobId, job.attempt]
      );
      const idempotencyLock = await client.query<JobCreationIdempotencyRow>(
        `/* compute:job-create-idempotency-lock */
         SELECT request_digest, status, job_receipt_id, admission_receipt_id,
                public_response_bytes
         FROM holomesh_compute_job_creation_idempotency
         WHERE team_id = $1 AND principal_digest = $2 AND operation = $3 AND key_digest = $4
         FOR UPDATE`,
        idempotencyKey
      );
      if (idempotencyLock.rows.length !== 1) {
        throw new ComputeJobStoreConflictError(
          'idempotency_incomplete',
          'job creation idempotency row could not be locked'
        );
      }
      const idempotency = idempotencyLock.rows[0];
      if (idempotency.request_digest !== command.requestDigest) {
        throw new ComputeJobStoreConflictError(
          'idempotency_key_reused',
          'job creation idempotency key is bound to another request'
        );
      }
      if (rowCount(insertedIdempotency) === 0) {
        if (
          idempotency.status !== 'committed' ||
          idempotency.job_receipt_id !== job.receiptId ||
          idempotency.admission_receipt_id !== command.admission.receipt.receiptId ||
          !idempotency.public_response_bytes
        ) {
          throw new ComputeJobStoreConflictError(
            'idempotency_incomplete',
            'job creation idempotency key is incomplete or binds another receipt'
          );
        }
        disposition = 'replayed';
        await this.assertAdmissionCurrentAtDatabaseClock(client, command.admission);
        await client.query('/* compute:commit */ COMMIT');
        committed = true;
        return await this.readBackJobCreation(
          client,
          command,
          disposition,
          idempotency.public_response_bytes
        );
      }

      const jobInsert = await client.query(
        `/* compute:job-create-insert */
         INSERT INTO holomesh_compute_jobs
           (team_id, job_id, attempt, principal_digest, work_unit_digest,
            state, version, receipt_id, job_bytes,
            capacity_ref, lease_receipt_id, fencing_epoch)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, NULL)
         ON CONFLICT (team_id, job_id, attempt) DO NOTHING
         RETURNING receipt_id`,
        [
          command.job.teamId,
          job.jobId,
          job.attempt,
          job.principalDigest,
          job.workUnit.digest,
          job.state,
          job.version,
          job.receiptId,
          command.job.bytes,
        ]
      );
      const jobLock = await client.query<JobRow>(
        `/* compute:job-create-lock */
         SELECT principal_digest, work_unit_digest, state, version, receipt_id, job_bytes, capacity_ref,
                lease_receipt_id, fencing_epoch
         FROM holomesh_compute_jobs
         WHERE team_id = $1 AND job_id = $2 AND attempt = $3
         FOR UPDATE`,
        [command.job.teamId, job.jobId, job.attempt]
      );
      if (jobLock.rows.length !== 1 || !this.jobMatches(jobLock.rows[0], command.job)) {
        throw new ComputeJobStoreConflictError(
          'job_already_exists',
          'job identity is already bound to different exact bytes'
        );
      }
      if (rowCount(jobInsert) === 0) disposition = 'replayed';

      await this.persistAdmission(client, {
        teamId: command.job.teamId,
        jobId: job.jobId,
        attempt: job.attempt,
        operationReceiptId: job.receiptId,
        admission: command.admission,
      });

      for (const evidence of command.evidence) {
        const evidenceInsert = await client.query(
          `/* compute:evidence-insert */
           INSERT INTO holomesh_compute_evidence
             (team_id, receipt_id, schema_version, evidence_bytes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (team_id, receipt_id) DO NOTHING
           RETURNING receipt_id`,
          [command.job.teamId, evidence.receiptId, evidence.schemaVersion, evidence.bytes]
        );
        if (rowCount(evidenceInsert) === 0) {
          const existing = await client.query<EvidenceBytesRow>(
            `/* compute:evidence-lock */
             SELECT receipt_id AS id, schema_version, evidence_bytes AS bytes
             FROM holomesh_compute_evidence
             WHERE team_id = $1 AND receipt_id = $2
             FOR UPDATE`,
            [command.job.teamId, evidence.receiptId]
          );
          if (
            existing.rows.length !== 1 ||
            existing.rows[0].schema_version !== evidence.schemaVersion ||
            existing.rows[0].bytes !== evidence.bytes
          ) {
            throw new ComputeJobStoreConflictError(
              'immutable_receipt_conflict',
              `evidence ${evidence.receiptId} already has different bytes`
            );
          }
        }
        const evidenceRef = await client.query(
          `/* compute:evidence-ref-insert */
           INSERT INTO holomesh_compute_evidence_refs
             (team_id, job_id, attempt, operation_receipt_id, evidence_receipt_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (team_id, operation_receipt_id, evidence_receipt_id) DO NOTHING
           RETURNING evidence_receipt_id`,
          [command.job.teamId, job.jobId, job.attempt, job.receiptId, evidence.receiptId]
        );
        if (rowCount(evidenceRef) !== 1 && disposition !== 'replayed') {
          throw new ComputeJobStoreConflictError(
            'immutable_receipt_conflict',
            `evidence reference ${evidence.receiptId} was not inserted`
          );
        }
      }

      for (const event of command.outbox) {
        const eventInsert = await client.query(
          `/* compute:outbox-insert */
           INSERT INTO holomesh_compute_outbox
             (team_id, event_id, aggregate_kind, aggregate_id, event_type, payload_bytes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (team_id, event_id) DO NOTHING
           RETURNING event_id`,
          [
            command.job.teamId,
            event.eventId,
            event.aggregateKind,
            event.aggregateId,
            event.eventType,
            event.bytes,
          ]
        );
        if (rowCount(eventInsert) === 0) {
          const existing = await client.query<OutboxBytesRow>(
            `/* compute:outbox-lock */
             SELECT event_id AS id, aggregate_kind, aggregate_id, event_type,
                    payload_bytes AS bytes
             FROM holomesh_compute_outbox
             WHERE team_id = $1 AND event_id = $2
             FOR UPDATE`,
            [command.job.teamId, event.eventId]
          );
          if (
            existing.rows.length !== 1 ||
            existing.rows[0].aggregate_kind !== event.aggregateKind ||
            existing.rows[0].aggregate_id !== event.aggregateId ||
            existing.rows[0].event_type !== event.eventType ||
            existing.rows[0].bytes !== event.bytes
          ) {
            throw new ComputeJobStoreConflictError(
              'immutable_receipt_conflict',
              `outbox event ${event.eventId} already has different bytes`
            );
          }
        }
      }

      const idempotencyCommit = await client.query(
        `/* compute:job-create-idempotency-commit */
         UPDATE holomesh_compute_job_creation_idempotency
         SET status = 'committed', job_receipt_id = $1,
             admission_receipt_id = $2, created_job_bytes = $3,
             public_response_bytes = $4,
             committed_at = clock_timestamp()
         WHERE team_id = $5 AND principal_digest = $6 AND operation = $7
           AND key_digest = $8 AND request_digest = $9 AND status = 'pending'
           AND $10::timestamptz > clock_timestamp()
           AND $11::timestamptz <= clock_timestamp() + INTERVAL '60 seconds'
           AND EXISTS (
             SELECT 1 FROM holomesh_compute_admission_refs r
             WHERE r.team_id = $5 AND r.operation_receipt_id = $1
               AND r.admission_receipt_id = $2
           )
         RETURNING key_digest`,
        [
          job.receiptId,
          command.admission.receipt.receiptId,
          command.job.bytes,
          command.publicResponseBytes,
          ...idempotencyKey,
          command.requestDigest,
          this.admissionEffectiveValidUntil(command.admission),
          command.admission.receipt.verifiedAt,
        ]
      );
      if (rowCount(idempotencyCommit) !== 1) {
        throw new ComputeJobStoreAdmissionError(['admission_expired_at_database_clock']);
      }

      await client.query('/* compute:commit */ COMMIT');
      committed = true;
      return await this.readBackJobCreation(client, command, disposition);
    } catch (error) {
      if (!committed) await rollbackQuietly(client);
      if (committed && !(error instanceof ComputeJobStoreReadbackError)) {
        throw new ComputeJobStoreReadbackError(
          `committed job creation readback failed: ${(error as Error).message}`
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async readBackJobCreation(
    client: ComputeJobStoreClient,
    command: CreateComputeJobCommand,
    disposition: CreateComputeJobResult['disposition'],
    expectedPublicResponseBytes = command.publicResponseBytes
  ): Promise<CreateComputeJobResult> {
    const job = command.job.receipt;
    const admissionReceiptId = await this.readBackAdmission(
      client,
      command.job.teamId,
      job.receiptId,
      command.admission
    );
    const primary = await client.query<JobCreationReadbackRow>(
      `/* compute:job-create-readback */
       SELECT i.request_digest, i.status, i.public_response_bytes,
              i.job_receipt_id, i.admission_receipt_id, i.created_job_bytes
       FROM holomesh_compute_job_creation_idempotency i
       WHERE i.team_id = $1 AND i.principal_digest = $2
         AND i.operation = $3 AND i.key_digest = $4`,
      [command.job.teamId, job.principalDigest, command.operation, command.idempotencyKeyDigest]
    );
    const row = primary.rows[0];
    if (
      primary.rows.length !== 1 ||
      row.status !== 'committed' ||
      row.request_digest !== command.requestDigest ||
      row.public_response_bytes !== expectedPublicResponseBytes ||
      row.job_receipt_id !== job.receiptId ||
      row.admission_receipt_id !== command.admission.receipt.receiptId ||
      row.created_job_bytes !== command.job.bytes
    ) {
      throw new ComputeJobStoreReadbackError(
        'committed initial job bytes did not read back exactly'
      );
    }

    const evidence = await client.query<EvidenceBytesRow>(
      `/* compute:evidence-readback */
       SELECT e.receipt_id AS id, e.schema_version, e.evidence_bytes AS bytes
       FROM holomesh_compute_evidence e
       JOIN holomesh_compute_evidence_refs r
         ON r.team_id = e.team_id AND r.evidence_receipt_id = e.receipt_id
       WHERE e.team_id = $1 AND r.operation_receipt_id = $2
         AND e.receipt_id = ANY($3::text[])
       ORDER BY e.receipt_id`,
      [
        command.job.teamId,
        command.job.receipt.receiptId,
        command.evidence.map((entry) => entry.receiptId),
      ]
    );
    const evidenceBytes = new Map(evidence.rows.map((entry) => [entry.id, entry.bytes]));
    if (
      evidenceBytes.size !== command.evidence.length ||
      command.evidence.some((entry) => {
        const durable = evidence.rows.find((row) => row.id === entry.receiptId);
        return (
          !durable ||
          durable.schema_version !== entry.schemaVersion ||
          durable.bytes !== entry.bytes
        );
      })
    ) {
      throw new ComputeJobStoreReadbackError('committed evidence bytes did not read back exactly');
    }
    const outbox = await client.query<OutboxBytesRow>(
      `/* compute:outbox-readback */
       SELECT event_id AS id, aggregate_kind, aggregate_id, event_type,
              payload_bytes AS bytes
       FROM holomesh_compute_outbox
       WHERE team_id = $1 AND event_id = ANY($2::text[])
       ORDER BY event_id`,
      [command.job.teamId, command.outbox.map((entry) => entry.eventId)]
    );
    const outboxBytes = new Map(outbox.rows.map((entry) => [entry.id, entry.bytes]));
    if (
      outboxBytes.size !== command.outbox.length ||
      command.outbox.some((entry) => {
        const durable = outbox.rows.find((row) => row.id === entry.eventId);
        return (
          !durable ||
          durable.aggregate_kind !== entry.aggregateKind ||
          durable.aggregate_id !== entry.aggregateId ||
          durable.event_type !== entry.eventType ||
          durable.bytes !== entry.bytes
        );
      })
    ) {
      throw new ComputeJobStoreReadbackError('committed outbox bytes did not read back exactly');
    }
    return {
      disposition,
      publicResponseBytes: row.public_response_bytes,
      jobReceiptId: row.job_receipt_id,
      readBack: {
        admissionReceiptId,
        evidenceReceiptIds: [...evidenceBytes.keys()].sort(),
        outboxEventIds: [...outboxBytes.keys()].sort(),
      },
    };
  }

  async commitTransition(
    input: CommitComputeJobTransitionCommand
  ): Promise<CommitComputeJobTransitionResult> {
    // Copy and validate once. Every retry consumes these exact same strings.
    const prepared = prepareCommand(input);
    const command: CommitComputeJobTransitionCommand = {
      ...prepared,
      admission: this.authenticateAdmission({
        admission: prepared.admission,
        teamId: prepared.expectedJob.teamId,
        principalDigest: prepared.expectedJob.receipt.principalDigest,
        jobId: prepared.expectedJob.receipt.jobId,
        attempt: prepared.expectedJob.receipt.attempt,
        operation: prepared.operation as ComputeJobAdmissionReceipt['operation'],
        requestDigest: prepared.requestDigest,
        workUnit: prepared.expectedWorkUnit,
        evidence: prepared.evidence,
        lifecycle: {
          kind: 'transition',
          expectedJobReceiptId: prepared.expectedJob.receipt.receiptId,
          nextJobReceiptId: prepared.nextJob.receipt.receiptId,
          transitionReceiptId: prepared.transition.receipt.receiptId,
        },
      }),
    };
    let retry = 0;
    while (true) {
      try {
        return await this.commitOnce(command);
      } catch (error) {
        if (RETRYABLE_SQL_STATES.has(sqlState(error) ?? '') && retry < this.maxTransactionRetries) {
          retry += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async commitOnce(
    command: CommitComputeJobTransitionCommand
  ): Promise<CommitComputeJobTransitionResult> {
    const client = await this.pool.connect();
    let committed = false;
    let disposition: CommitComputeJobTransitionResult['disposition'] = 'committed';
    try {
      await client.query('/* compute:begin */ BEGIN ISOLATION LEVEL SERIALIZABLE');

      const expectedJob = command.expectedJob.receipt;
      const nextJob = command.nextJob.receipt;
      const transition = command.transition.receipt;
      const allocatorCommit = command.allocationCommit?.receipt;
      const idempotencyKey = [
        command.expectedJob.teamId,
        expectedJob.principalDigest,
        command.operation,
        command.idempotencyKeyDigest,
      ];
      const inserted = await client.query(
        `/* compute:idempotency-insert */
         INSERT INTO holomesh_compute_idempotency
           (team_id, principal_digest, operation, key_digest, request_digest, status, job_id, attempt)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
         ON CONFLICT (team_id, principal_digest, operation, key_digest) DO NOTHING
         RETURNING key_digest`,
        [...idempotencyKey, command.requestDigest, expectedJob.jobId, expectedJob.attempt]
      );
      const idempotencyLock = await client.query<IdempotencyRow>(
        `/* compute:idempotency-lock */
         SELECT request_digest, status, transition_receipt_id,
                allocation_commit_receipt_id, admission_receipt_id,
                public_response_bytes
         FROM holomesh_compute_idempotency
         WHERE team_id = $1 AND principal_digest = $2 AND operation = $3 AND key_digest = $4
         FOR UPDATE`,
        idempotencyKey
      );
      if (idempotencyLock.rows.length !== 1) {
        throw new ComputeJobStoreConflictError(
          'idempotency_incomplete',
          'idempotency row could not be locked'
        );
      }
      const idempotency = idempotencyLock.rows[0];
      if (idempotency.request_digest !== command.requestDigest) {
        throw new ComputeJobStoreConflictError(
          'idempotency_key_reused',
          'idempotency key digest is already bound to different request bytes'
        );
      }
      if (rowCount(inserted) === 0) {
        if (idempotency.status !== 'committed' || !idempotency.public_response_bytes) {
          throw new ComputeJobStoreConflictError(
            'idempotency_incomplete',
            'idempotency key is bound to an incomplete transaction'
          );
        }
        if (
          idempotency.transition_receipt_id !== transition.receiptId ||
          idempotency.allocation_commit_receipt_id !== (allocatorCommit?.receiptId ?? null) ||
          idempotency.admission_receipt_id !== command.admission.receipt.receiptId
        ) {
          throw new ComputeJobStoreConflictError(
            'idempotency_key_reused',
            'idempotency replay does not bind the same immutable receipts'
          );
        }
        disposition = 'replayed';
        await this.assertAdmissionCurrentAtDatabaseClock(client, command.admission);
        await client.query('/* compute:commit */ COMMIT');
        committed = true;
        return await this.readBack(client, command, disposition, idempotency.public_response_bytes);
      }

      const jobLock = await client.query<JobRow>(
        `/* compute:job-lock */
         SELECT principal_digest, work_unit_digest, state, version, receipt_id, job_bytes, capacity_ref,
                lease_receipt_id, fencing_epoch
         FROM holomesh_compute_jobs
         WHERE team_id = $1 AND job_id = $2 AND attempt = $3
         FOR UPDATE`,
        [command.expectedJob.teamId, expectedJob.jobId, expectedJob.attempt]
      );
      if (jobLock.rows.length !== 1 || !this.jobMatches(jobLock.rows[0], command.expectedJob)) {
        throw new ComputeJobStoreConflictError(
          'job_cas_conflict',
          'job version, receipt, or exact bytes changed before commit'
        );
      }

      if (command.expectedAllocation) {
        const allocationLock = await client.query<AllocationRow>(
          `/* compute:allocation-lock */
           SELECT lane, slot_state, current_epoch, current_lease_receipt_id,
                  version, etag, cursor_bytes, b.eligibility_bytes,
                  b.data_policy_bytes, b.provider, b.provider_resource_id,
                  b.eligible, b.valid_until, b.data_policy_valid_until,
                  b.allowed_data_classifications
           FROM holomesh_compute_allocations a
           JOIN holomesh_compute_capacity_bindings b
             ON b.team_id = a.team_id AND b.capacity_ref = a.capacity_ref
           WHERE a.team_id = $1 AND a.capacity_ref = $2
           FOR UPDATE OF a, b`,
          [command.expectedAllocation.teamId, command.expectedAllocation.cursor.capacityRef]
        );
        if (
          allocationLock.rows.length !== 1 ||
          !this.allocationMatches(
            allocationLock.rows[0],
            command.expectedAllocation,
            command.expectedCapacityEligibilityBytes as string,
            command.expectedCapacityDataPolicyBytes as string
          )
        ) {
          throw new ComputeJobStoreConflictError(
            'allocation_cas_conflict',
            'allocation cursor changed before commit'
          );
        }
        const acquire = command.allocationCommit?.receipt.operation === 'acquire';
        const eligibility = parseEligibilityBytes(
          command.expectedCapacityEligibilityBytes as string,
          'expectedCapacityEligibilityBytes'
        );
        const dataPolicy = parseDataPolicyBytes(
          command.expectedCapacityDataPolicyBytes as string,
          'expectedCapacityDataPolicyBytes'
        );
        const workUnit = command.expectedWorkUnit as ComputeWorkUnitEnvelope;
        const leaseExpiresAt =
          command.nextJob.receipt.lease?.expiresAt ?? command.expectedJob.receipt.lease?.expiresAt;
        if (!leaseExpiresAt) {
          throw new ComputeJobStoreConflictError(
            'allocation_cas_conflict',
            'allocation mutation does not bind a lease expiry'
          );
        }
        const policyClock = await client.query<PolicyClockRow>(
          `/* compute:allocation-policy-clock */
           SELECT (
             NOT $1::boolean OR (
               $2::timestamptz > clock_timestamp() AND
               $3::timestamptz > clock_timestamp() AND
               $4::timestamptz > clock_timestamp() AND
               $5::text = ANY($6::text[])
             )
           ) AS admitted`,
          [
            acquire,
            eligibility.validUntil,
            dataPolicy.validUntil,
            leaseExpiresAt,
            workUnit.contract.compute.policy.dataClassification,
            [...dataPolicy.allowedDataClassifications],
          ]
        );
        if (policyClock.rows.length !== 1 || policyClock.rows[0].admitted !== true) {
          throw new ComputeJobStoreConflictError(
            'allocation_cas_conflict',
            'capacity policy or lease is not current at the database clock'
          );
        }
      }

      const nextLease = jobLeaseColumns(nextJob);
      const jobUpdate = await client.query(
        `/* compute:job-update */
         UPDATE holomesh_compute_jobs
         SET state = $1, version = $2, receipt_id = $3, job_bytes = $4,
             capacity_ref = $5, lease_receipt_id = $6, fencing_epoch = $7,
             updated_at = NOW()
         WHERE team_id = $8 AND job_id = $9 AND attempt = $10
           AND version = $11 AND receipt_id = $12 AND job_bytes = $13
           AND principal_digest = $14 AND work_unit_digest = $15
         RETURNING receipt_id`,
        [
          nextJob.state,
          nextJob.version,
          nextJob.receiptId,
          command.nextJob.bytes,
          nextLease.capacityRef,
          nextLease.leaseReceiptId,
          nextLease.fencingEpoch,
          command.expectedJob.teamId,
          expectedJob.jobId,
          expectedJob.attempt,
          expectedJob.version,
          expectedJob.receiptId,
          command.expectedJob.bytes,
          expectedJob.principalDigest,
          expectedJob.workUnit.digest,
        ]
      );
      if (rowCount(jobUpdate) !== 1) {
        throw new ComputeJobStoreConflictError('job_cas_conflict', 'job CAS updated no row');
      }

      if (command.expectedAllocation && command.nextAllocation) {
        const expectedCursor = command.expectedAllocation.cursor;
        const nextCursor = command.nextAllocation.cursor;
        const allocationUpdate = await client.query(
          `/* compute:allocation-update */
           UPDATE holomesh_compute_allocations
           SET lane = $1, slot_state = $2, current_epoch = $3,
               current_lease_receipt_id = $4, version = $5, etag = $6,
               cursor_bytes = $7, updated_at = NOW()
           WHERE team_id = $8 AND capacity_ref = $9
             AND version = $10 AND etag = $11 AND cursor_bytes = $12
             AND current_epoch = $13 AND slot_state = $14
             AND current_lease_receipt_id IS NOT DISTINCT FROM $15
           RETURNING etag`,
          [
            command.nextAllocation.lane,
            nextCursor.slotState,
            nextCursor.currentEpoch,
            nullable(nextCursor.currentLeaseReceiptId),
            nextCursor.version,
            nextCursor.etag,
            command.nextAllocation.bytes,
            command.expectedAllocation.teamId,
            expectedCursor.capacityRef,
            expectedCursor.version,
            expectedCursor.etag,
            command.expectedAllocation.bytes,
            expectedCursor.currentEpoch,
            expectedCursor.slotState,
            nullable(expectedCursor.currentLeaseReceiptId),
          ]
        );
        if (rowCount(allocationUpdate) !== 1) {
          throw new ComputeJobStoreConflictError(
            'allocation_cas_conflict',
            'allocation CAS updated no row'
          );
        }
      }

      await this.persistAdmission(client, {
        teamId: command.expectedJob.teamId,
        jobId: expectedJob.jobId,
        attempt: expectedJob.attempt,
        operationReceiptId: transition.receiptId,
        admission: command.admission,
      });

      for (const evidence of command.evidence) {
        const evidenceInsert = await client.query(
          `/* compute:evidence-insert */
           INSERT INTO holomesh_compute_evidence
             (team_id, receipt_id, schema_version, evidence_bytes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (team_id, receipt_id) DO NOTHING
           RETURNING receipt_id`,
          [command.expectedJob.teamId, evidence.receiptId, evidence.schemaVersion, evidence.bytes]
        );
        if (rowCount(evidenceInsert) === 0) {
          const existing = await client.query<EvidenceBytesRow>(
            `/* compute:evidence-lock */
             SELECT receipt_id AS id, schema_version, evidence_bytes AS bytes
             FROM holomesh_compute_evidence
             WHERE team_id = $1 AND receipt_id = $2
             FOR UPDATE`,
            [command.expectedJob.teamId, evidence.receiptId]
          );
          if (
            existing.rows.length !== 1 ||
            existing.rows[0].schema_version !== evidence.schemaVersion ||
            existing.rows[0].bytes !== evidence.bytes
          ) {
            throw new ComputeJobStoreConflictError(
              'immutable_receipt_conflict',
              `evidence ${evidence.receiptId} already has different bytes`
            );
          }
        }
        const evidenceRef = await client.query(
          `/* compute:evidence-ref-insert */
           INSERT INTO holomesh_compute_evidence_refs
             (team_id, job_id, attempt, operation_receipt_id, evidence_receipt_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (team_id, operation_receipt_id, evidence_receipt_id) DO NOTHING
           RETURNING evidence_receipt_id`,
          [
            command.expectedJob.teamId,
            expectedJob.jobId,
            expectedJob.attempt,
            transition.receiptId,
            evidence.receiptId,
          ]
        );
        if (rowCount(evidenceRef) !== 1) {
          throw new ComputeJobStoreConflictError(
            'immutable_receipt_conflict',
            `evidence reference ${evidence.receiptId} was not inserted`
          );
        }
      }

      const transitionInsert = await client.query(
        `/* compute:transition-insert */
         INSERT INTO holomesh_compute_transitions
           (team_id, transition_receipt_id, job_id, attempt, from_state, to_state,
            from_version, to_version, from_receipt_id, to_receipt_id,
            request_digest, transition_bytes, to_job_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT DO NOTHING
         RETURNING transition_receipt_id`,
        [
          command.expectedJob.teamId,
          transition.receiptId,
          expectedJob.jobId,
          expectedJob.attempt,
          transition.from.state,
          transition.to.state,
          transition.from.version,
          transition.to.version,
          transition.from.receiptId,
          transition.to.receiptId,
          command.requestDigest,
          command.transition.bytes,
          command.nextJob.bytes,
        ]
      );
      if (rowCount(transitionInsert) !== 1) {
        throw new ComputeJobStoreConflictError(
          'immutable_receipt_conflict',
          'transition receipt was not inserted'
        );
      }

      if (
        command.expectedAllocation &&
        command.nextAllocation &&
        command.allocationCommit &&
        allocatorCommit
      ) {
        const expectedCursor = command.expectedAllocation.cursor;
        const nextCursor = command.nextAllocation.cursor;
        const allocationCommitInsert = await client.query(
          `/* compute:allocation-commit-insert */
           INSERT INTO holomesh_compute_allocation_commits
             (team_id, allocation_commit_receipt_id, capacity_ref, job_id, attempt,
              transition_receipt_id, lease_receipt_id, previous_version, next_version,
              previous_etag, next_etag, previous_epoch, next_epoch,
              previous_slot_state, next_slot_state, commit_bytes, next_cursor_bytes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT DO NOTHING
           RETURNING allocation_commit_receipt_id`,
          [
            command.expectedJob.teamId,
            allocatorCommit.receiptId,
            expectedCursor.capacityRef,
            expectedJob.jobId,
            expectedJob.attempt,
            transition.receiptId,
            nullable(nextCursor.currentLeaseReceiptId),
            expectedCursor.version,
            nextCursor.version,
            expectedCursor.etag,
            nextCursor.etag,
            expectedCursor.currentEpoch,
            nextCursor.currentEpoch,
            expectedCursor.slotState,
            nextCursor.slotState,
            command.allocationCommit.bytes,
            command.nextAllocation.bytes,
          ]
        );
        if (rowCount(allocationCommitInsert) !== 1) {
          throw new ComputeJobStoreConflictError(
            'immutable_receipt_conflict',
            'allocation commit receipt was not inserted'
          );
        }
      }

      for (const event of command.outbox) {
        const outboxInsert = await client.query(
          `/* compute:outbox-insert */
           INSERT INTO holomesh_compute_outbox
             (team_id, event_id, aggregate_kind, aggregate_id, event_type, payload_bytes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (team_id, event_id) DO NOTHING
           RETURNING event_id`,
          [
            command.expectedJob.teamId,
            event.eventId,
            event.aggregateKind,
            event.aggregateId,
            event.eventType,
            event.bytes,
          ]
        );
        if (rowCount(outboxInsert) !== 1) {
          throw new ComputeJobStoreConflictError(
            'immutable_receipt_conflict',
            `outbox event ${event.eventId} was not inserted`
          );
        }
      }

      const requiresLeaseCurrent =
        transition.action === 'acquire_lease' ||
        transition.action === 'start' ||
        transition.action === 'mark_running';
      const finalLeaseExpiresAt = nextJob.lease?.expiresAt ?? expectedJob.lease?.expiresAt ?? null;
      if (requiresLeaseCurrent && !finalLeaseExpiresAt) {
        throw new ComputeJobStoreConflictError(
          transition.action === 'acquire_lease' ? 'allocation_cas_conflict' : 'job_cas_conflict',
          `${transition.action} does not bind a lease expiry for the final database commit gate`
        );
      }
      const requiresCapacityCurrent = transition.action === 'acquire_lease';
      const finalEligibility = requiresCapacityCurrent
        ? parseEligibilityBytes(
            command.expectedCapacityEligibilityBytes as string,
            'expectedCapacityEligibilityBytes'
          )
        : undefined;
      const finalDataPolicy = requiresCapacityCurrent
        ? parseDataPolicyBytes(
            command.expectedCapacityDataPolicyBytes as string,
            'expectedCapacityDataPolicyBytes'
          )
        : undefined;

      const idempotencyCommit = await client.query(
        `/* compute:idempotency-commit */
         UPDATE holomesh_compute_idempotency
         SET status = 'committed', transition_receipt_id = $1,
              allocation_commit_receipt_id = $2, admission_receipt_id = $3,
              public_response_bytes = $4,
              committed_at = clock_timestamp()
         WHERE team_id = $5 AND principal_digest = $6 AND operation = $7
           AND key_digest = $8 AND request_digest = $9 AND status = 'pending'
           AND $10::timestamptz > clock_timestamp()
           AND $11::timestamptz <= clock_timestamp() + INTERVAL '60 seconds'
           AND (NOT $12::boolean OR $13::timestamptz > clock_timestamp())
           AND (
             NOT $14::boolean OR (
               $15::timestamptz > clock_timestamp() AND
               $16::timestamptz > clock_timestamp()
             )
           )
           AND EXISTS (
             SELECT 1 FROM holomesh_compute_admission_refs r
             WHERE r.team_id = $5 AND r.operation_receipt_id = $1
               AND r.admission_receipt_id = $3
           )
         RETURNING key_digest`,
        [
          transition.receiptId,
          allocatorCommit?.receiptId ?? null,
          command.admission.receipt.receiptId,
          command.publicResponseBytes,
          ...idempotencyKey,
          command.requestDigest,
          this.admissionEffectiveValidUntil(command.admission),
          command.admission.receipt.verifiedAt,
          requiresLeaseCurrent,
          finalLeaseExpiresAt,
          requiresCapacityCurrent,
          finalEligibility?.validUntil ?? null,
          finalDataPolicy?.validUntil ?? null,
        ]
      );
      if (rowCount(idempotencyCommit) !== 1) {
        throw new ComputeJobStoreAdmissionError(['final_policy_expired_at_database_clock']);
      }

      await client.query('/* compute:commit */ COMMIT');
      committed = true;
      return await this.readBack(client, command, disposition);
    } catch (error) {
      if (!committed) await rollbackQuietly(client);
      if (committed && !(error instanceof ComputeJobStoreReadbackError)) {
        throw new ComputeJobStoreReadbackError(
          `committed job transition readback failed: ${(error as Error).message}`
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private jobMatches(row: JobRow, expected: ComputeJobProjection): boolean {
    const receipt = expected.receipt;
    const lease = jobLeaseColumns(receipt);
    return (
      row.principal_digest === receipt.principalDigest &&
      row.work_unit_digest === receipt.workUnit.digest &&
      row.state === receipt.state &&
      asSafeInteger(row.version, 'job.version') === receipt.version &&
      row.receipt_id === receipt.receiptId &&
      row.job_bytes === expected.bytes &&
      row.capacity_ref === lease.capacityRef &&
      row.lease_receipt_id === lease.leaseReceiptId &&
      asSafeInteger(row.fencing_epoch, 'job.fencing_epoch') === lease.fencingEpoch
    );
  }

  private allocationMatches(
    row: AllocationRow,
    expected: ComputeAllocationProjection,
    expectedEligibilityBytes: string,
    expectedDataPolicyBytes: string
  ): boolean {
    const eligibility = parseEligibilityBytes(
      expectedEligibilityBytes,
      'expectedCapacityEligibilityBytes'
    );
    const dataPolicy = parseDataPolicyBytes(
      expectedDataPolicyBytes,
      'expectedCapacityDataPolicyBytes'
    );
    return (
      row.lane === expected.lane &&
      row.slot_state === expected.cursor.slotState &&
      asSafeInteger(row.current_epoch, 'allocation.current_epoch') ===
        expected.cursor.currentEpoch &&
      row.current_lease_receipt_id === nullable(expected.cursor.currentLeaseReceiptId) &&
      asSafeInteger(row.version, 'allocation.version') === expected.cursor.version &&
      row.etag === expected.cursor.etag &&
      row.cursor_bytes === expected.bytes &&
      row.eligibility_bytes === expectedEligibilityBytes &&
      row.data_policy_bytes === expectedDataPolicyBytes &&
      row.provider === eligibility.provider &&
      row.provider_resource_id === String(eligibility.instanceId) &&
      row.eligible === eligibility.eligible &&
      dbTimestampMatches(row.valid_until, eligibility.validUntil) &&
      dbTimestampMatches(row.data_policy_valid_until, dataPolicy.validUntil) &&
      canonicalJson(row.allowed_data_classifications) ===
        canonicalJson(dataPolicy.allowedDataClassifications)
    );
  }

  private async readBack(
    client: ComputeJobStoreClient,
    command: CommitComputeJobTransitionCommand,
    disposition: CommitComputeJobTransitionResult['disposition'],
    expectedPublicResponseBytes = command.publicResponseBytes
  ): Promise<CommitComputeJobTransitionResult> {
    const admissionReceiptId = await this.readBackAdmission(
      client,
      command.expectedJob.teamId,
      command.transition.receipt.receiptId,
      command.admission
    );
    const primary = await client.query<ReadbackRow>(
      `/* compute:readback */
       SELECT i.request_digest, i.status, i.public_response_bytes,
               i.transition_receipt_id, i.allocation_commit_receipt_id,
               i.admission_receipt_id,
               t.transition_bytes, t.to_job_bytes,
               c.commit_bytes, c.next_cursor_bytes,
               c.next_etag AS committed_next_etag
       FROM holomesh_compute_idempotency i
       JOIN holomesh_compute_transitions t
         ON t.team_id = i.team_id AND t.transition_receipt_id = i.transition_receipt_id
       LEFT JOIN holomesh_compute_allocation_commits c
         ON c.team_id = i.team_id
         AND c.allocation_commit_receipt_id = i.allocation_commit_receipt_id
       WHERE i.team_id = $1 AND i.principal_digest = $2
         AND i.operation = $3 AND i.key_digest = $4`,
      [
        command.expectedJob.teamId,
        command.expectedJob.receipt.principalDigest,
        command.operation,
        command.idempotencyKeyDigest,
      ]
    );
    const row = primary.rows[0];
    if (
      primary.rows.length !== 1 ||
      row.status !== 'committed' ||
      row.request_digest !== command.requestDigest ||
      row.public_response_bytes !== expectedPublicResponseBytes ||
      row.transition_receipt_id !== command.transition.receipt.receiptId ||
      row.allocation_commit_receipt_id !== (command.allocationCommit?.receipt.receiptId ?? null) ||
      row.admission_receipt_id !== command.admission.receipt.receiptId ||
      row.transition_bytes !== command.transition.bytes ||
      row.to_job_bytes !== command.nextJob.bytes ||
      row.commit_bytes !== (command.allocationCommit?.bytes ?? null) ||
      row.next_cursor_bytes !== (command.nextAllocation?.bytes ?? null) ||
      row.committed_next_etag !== (command.nextAllocation?.cursor.etag ?? null)
    ) {
      throw new ComputeJobStoreReadbackError(
        'committed idempotency, transition, or allocation bytes did not read back exactly'
      );
    }

    const allocationEtag = command.nextAllocation?.cursor.etag;

    const evidence =
      command.evidence.length === 0
        ? { rows: [] as EvidenceBytesRow[], rowCount: 0 }
        : await client.query<EvidenceBytesRow>(
            `/* compute:evidence-readback */
       SELECT e.receipt_id AS id, e.schema_version, e.evidence_bytes AS bytes
       FROM holomesh_compute_evidence e
       JOIN holomesh_compute_evidence_refs r
         ON r.team_id = e.team_id AND r.evidence_receipt_id = e.receipt_id
       WHERE e.team_id = $1 AND r.operation_receipt_id = $2
         AND e.receipt_id = ANY($3::text[])
       ORDER BY e.receipt_id`,
            [
              command.expectedJob.teamId,
              command.transition.receipt.receiptId,
              command.evidence.map((entry) => entry.receiptId),
            ]
          );
    const evidenceBytes = new Map(evidence.rows.map((entry) => [entry.id, entry.bytes]));
    if (
      evidenceBytes.size !== command.evidence.length ||
      command.evidence.some((entry) => {
        const durable = evidence.rows.find((row) => row.id === entry.receiptId);
        return (
          !durable ||
          durable.schema_version !== entry.schemaVersion ||
          durable.bytes !== entry.bytes
        );
      })
    ) {
      throw new ComputeJobStoreReadbackError('committed evidence bytes did not read back exactly');
    }

    const outbox = await client.query<OutboxBytesRow>(
      `/* compute:outbox-readback */
       SELECT event_id AS id, aggregate_kind, aggregate_id, event_type,
              payload_bytes AS bytes
       FROM holomesh_compute_outbox
       WHERE team_id = $1 AND event_id = ANY($2::text[])
       ORDER BY event_id`,
      [command.expectedJob.teamId, command.outbox.map((entry) => entry.eventId)]
    );
    const outboxBytes = new Map(outbox.rows.map((entry) => [entry.id, entry.bytes]));
    if (
      outboxBytes.size !== command.outbox.length ||
      command.outbox.some((entry) => {
        const durable = outbox.rows.find((row) => row.id === entry.eventId);
        return (
          !durable ||
          durable.aggregate_kind !== entry.aggregateKind ||
          durable.aggregate_id !== entry.aggregateId ||
          durable.event_type !== entry.eventType ||
          durable.bytes !== entry.bytes
        );
      })
    ) {
      throw new ComputeJobStoreReadbackError('committed outbox bytes did not read back exactly');
    }

    return {
      disposition,
      publicResponseBytes: row.public_response_bytes,
      transitionReceiptId: row.transition_receipt_id,
      ...(row.allocation_commit_receipt_id
        ? { allocationCommitReceiptId: row.allocation_commit_receipt_id }
        : {}),
      readBack: {
        jobReceiptId: command.nextJob.receipt.receiptId,
        admissionReceiptId,
        ...(allocationEtag ? { allocationEtag } : {}),
        evidenceReceiptIds: [...evidenceBytes.keys()].sort(),
        outboxEventIds: [...outboxBytes.keys()].sort(),
      },
    };
  }
}

export async function createComputeJobStore(
  options: CreateComputeJobStoreOptions
): Promise<PostgresComputeJobStore> {
  return PostgresComputeJobStore.create(options);
}
