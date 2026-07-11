/**
 * Attestation persistence — Phase 2 durability for the AttestationRegistry.
 *
 * The registry (attestation-registry.ts) was Phase-1 in-memory only: every
 * orchestrator restart/redeploy wiped all founder attestations. That made the
 * from-scratch paid-launch gate (`verifyLiveRegisteredHoloMeshSeat` →
 * GET /api/holomesh/me/attestation) unsatisfiable in practice — a seat could
 * read back `attested:false` moments after a legitimate attestation because the
 * process had bounced. This module makes attestations durable so ONE founder
 * (Trezor) attestation survives restarts instead of needing to be re-signed
 * each deploy.
 *
 * Storage: mirrors the team-store JSON-fallback convention exactly — an atomic
 * JSON snapshot under HOLOMESH_DATA_DIR via `atomicWriteJSON` / `readJSON`
 * (state.ts). `Uint8Array` PQC keys are base64-encoded on the wire, matching the
 * custodial-wallet convention.
 *
 * Trust model: identical to `persistTeamDurable` — the snapshot is written ONLY
 * from records the registry already accepted (each landed via a verified
 * /approve, /approve-via-tx chain proof, or custodial provision). Reloading them
 * on boot preserves existing trust; it does not create new trust. The store
 * lives in the same trust boundary as the in-memory registry.
 *
 * DURABILITY SCOPE (honest caveat): a disk snapshot is durable across process
 * restarts and on any deployment with a persistent volume (the sovereign Jetson
 * orchestrator, local). On an ephemeral-container host (Railway) it survives
 * in-container restarts but a full redeploy still resets the volume — that host
 * needs a persistent volume or a DATABASE_URL-backed store. The save/load
 * functions are deliberately small so a Postgres backend can slot in behind them
 * (follow-up), matching how team-store.ts chooses Postgres when DATABASE_URL is
 * set.
 *
 * @module holomesh/identity/attestation-persistence
 */

import * as path from 'path';
import { HOLOMESH_DATA_DIR, atomicWriteJSON, readJSON } from '../state';
import { AttestationRegistry, type Attestation } from './attestation-registry';
import { getAttestationRegistry, setAttestationRegistry } from './signing-middleware';

/** Durable snapshot file, sibling to teams.json under the HoloMesh data dir. */
export const ATTESTATION_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'attestations.json');

/** Current on-disk schema version. Bump when the wire shape changes. */
export const ATTESTATION_STORE_VERSION = 1 as const;

/** Debounce window (ms) for coalescing a burst of attests (e.g. a batch
 *  /approve of the whole fleet) into a single disk write. */
const SAVE_DEBOUNCE_MS = 250;

/** Wire shape of one attestation on disk — identical to `Attestation` except the
 *  optional `pqcPublicKey` binary field is base64-encoded. */
interface PersistedAttestation extends Omit<Attestation, 'pqcPublicKey'> {
  /** base64 of the ML-DSA-65 public key bytes, when present. */
  pqcPublicKeyB64?: string;
}

interface PersistedSnapshot {
  version: number;
  savedAt: string;
  attestations: PersistedAttestation[];
  retired: string[];
}

function encodeAttestation(att: Attestation): PersistedAttestation {
  const { pqcPublicKey, ...rest } = att;
  const out: PersistedAttestation = { ...rest };
  if (pqcPublicKey && pqcPublicKey.length > 0) {
    out.pqcPublicKeyB64 = Buffer.from(pqcPublicKey).toString('base64');
  }
  return out;
}

function decodeAttestation(row: PersistedAttestation): Attestation | null {
  if (!row || !row.publicKey || !row.seatId) return null;
  const { pqcPublicKeyB64, ...rest } = row;
  const att: Attestation = { ...rest } as Attestation;
  if (typeof pqcPublicKeyB64 === 'string' && pqcPublicKeyB64.length > 0) {
    att.pqcPublicKey = new Uint8Array(Buffer.from(pqcPublicKeyB64, 'base64'));
  }
  return att;
}

/** Encode a registry snapshot for the wire (test seam — pure, no fs). */
export function encodeSnapshot(registry: AttestationRegistry, savedAt: string): PersistedSnapshot {
  const snap = registry.snapshot();
  return {
    version: ATTESTATION_STORE_VERSION,
    savedAt,
    attestations: snap.attestations.map(encodeAttestation),
    retired: snap.retired,
  };
}

/** Decode a wire snapshot back into the shape `AttestationRegistry.restore` wants
 *  (test seam — pure, no fs). Malformed rows are dropped, not fatal. */
export function decodeSnapshot(
  persisted: PersistedSnapshot | null,
): { attestations: Attestation[]; retired: string[] } | null {
  if (!persisted || !Array.isArray(persisted.attestations)) return null;
  const attestations = persisted.attestations
    .map(decodeAttestation)
    .filter((a): a is Attestation => a !== null);
  const retired = Array.isArray(persisted.retired) ? persisted.retired : [];
  return { attestations, retired };
}

/** Synchronous atomic write of the registry snapshot. Never throws — a persist
 *  failure logs and is retried on the next mutation (atomicWriteJSON swallows). */
export function saveAttestationSnapshotNow(
  registry: AttestationRegistry = getAttestationRegistry(),
  nowIso: string = new Date().toISOString(),
): void {
  atomicWriteJSON(ATTESTATION_STORE_PATH, encodeSnapshot(registry, nowIso));
}

/** Read + decode the persisted snapshot. Returns null when absent/corrupt. */
export function loadAttestationSnapshot(): { attestations: Attestation[]; retired: string[] } | null {
  const raw = readJSON(ATTESTATION_STORE_PATH) as PersistedSnapshot | null;
  return decodeSnapshot(raw);
}

let _saveTimer: NodeJS.Timeout | null = null;

/** Debounced save wired to the registry's `onChange`. Coalesces a burst of
 *  attests/retires into one write; the timer is unref'd so it never keeps the
 *  process alive. */
function scheduleSave(registry: AttestationRegistry): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveAttestationSnapshotNow(registry);
  }, SAVE_DEBOUNCE_MS);
  if (typeof _saveTimer.unref === 'function') _saveTimer.unref();
}

let _initialized = false;

/**
 * Boot-time init: load the persisted snapshot into a fresh registry, wire its
 * `onChange` to a debounced save, and install it as the module singleton.
 * Call once at server startup (http-server.ts, right after `initStores()`).
 * Idempotent; safe to call before any request handler touches the registry.
 */
export function initDurableAttestationRegistry(): void {
  if (_initialized) return;
  _initialized = true;
  let loaded: { attestations: Attestation[]; retired: string[] } | null = null;
  try {
    loaded = loadAttestationSnapshot();
  } catch (e) {
    console.warn(
      '[HoloMesh] attestation snapshot load failed (starting empty):',
      e instanceof Error ? e.message : String(e),
    );
  }
  const registry = new AttestationRegistry({ onChange: () => scheduleSave(registry) });
  if (loaded) registry.restore(loaded);
  setAttestationRegistry(registry);
  if (loaded) {
    console.log(
      `[HoloMesh] attestation registry restored: ${loaded.attestations.length} attestation(s), ` +
        `${loaded.retired.length} retired, from ${ATTESTATION_STORE_PATH}`,
    );
  }
}

/** Test-only: reset the one-shot init guard + debounce timer. */
export function _resetAttestationPersistenceForTests(): void {
  _initialized = false;
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
}
