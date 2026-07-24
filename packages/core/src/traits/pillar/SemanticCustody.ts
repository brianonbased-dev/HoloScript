/**
 * Production custody admission for structured inter-agent messages.
 *
 * The tournament frame used an unkeyed digest to test field binding. This
 * module deliberately does not treat that digest as sender authentication.
 * Instead, it binds the semantic payload to the signed HoloMesh envelope and
 * delegates cryptographic verification to the transport's real verifier.
 *
 * Trait handlers remain synchronous. Admission is asynchronous and marks the
 * exact message object in a module-private WeakMap only after signature,
 * binding, freshness, and replay checks succeed. A serialized or caller-made
 * `verified: true` flag therefore cannot cross the trust boundary.
 */

export const SEMANTIC_CUSTODY_SCHEMA = 'holoscript.semantic-custody.v2' as const;

export interface SemanticCustodyMessageLike {
  version: '2.0';
  message_id: string;
  from: string;
  to: string;
  created_at_ms: number;
  action: string;
  nonce: string;
  pillar_slice: {
    axis_1_id: string;
    axis_2_id: string;
  };
  provenance: {
    surface_id: string;
    holokey: string;
    signer_address: string;
  };
  brain_coord?: unknown;
  receipt?: unknown;
  scene_delta?: unknown;
  task_state?: unknown;
  confidence?: number;
  payload?: Record<string, unknown>;
  parallel_slice?: unknown;
  text_boundary?: string;
  custody?: SemanticCustodyEnvelope;
}

export interface SemanticCustodyBindingV2 {
  schema: typeof SEMANTIC_CUSTODY_SCHEMA;
  message_id: string;
  action: string;
  sender: string;
  recipient: string;
  nonce: string;
  axis_1_id: string;
  axis_2_id: string;
  payload_digest: string;
  surface_id: string;
  holokey: string;
}

/**
 * Wire-compatible with the HoloMesh request-signing envelope.
 * `holokey` identity is inside `body`, so the transport signature binds it.
 */
export interface HoloMeshSignedSemanticEnvelope {
  body: SemanticCustodyBindingV2;
  signature: string;
  signer_address: string;
  nonce: string;
  timestamp: string;
}

export interface SemanticCustodyEnvelope {
  schema: typeof SEMANTIC_CUSTODY_SCHEMA;
  signed: HoloMeshSignedSemanticEnvelope;
}

export interface SemanticCustodyVerification {
  valid: boolean;
  signer: string | null;
  reason?: string;
}

export type SemanticCustodyVerifier = (
  envelope: HoloMeshSignedSemanticEnvelope
) => Promise<SemanticCustodyVerification>;

export interface SemanticReplayStore {
  /**
   * Atomically claims a signer-scoped nonce. Returns false when it was already
   * consumed. Durable transports should back this with shared storage.
   */
  claim(signer: string, nonce: string): boolean | Promise<boolean>;
}

export class InMemorySemanticReplayStore implements SemanticReplayStore {
  readonly #seen = new Set<string>();

  claim(signer: string, nonce: string): boolean {
    const key = `${signer.toLowerCase()}:${nonce}`;
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    return true;
  }

  clear(): void {
    this.#seen.clear();
  }
}

export type SemanticCustodyFailureReason =
  | 'missing-custody'
  | 'schema-version'
  | 'binding-mismatch'
  | 'payload-digest'
  | 'signature'
  | 'signer-mismatch'
  | 'replay';

export interface SemanticCustodyReceipt {
  schema: 'holoscript.semantic-custody-receipt.v1';
  accepted: true;
  message_id: string;
  action: string;
  sender: string;
  recipient: string;
  nonce: string;
  signer_address: string;
  payload_digest: string;
  receipt_digest: string;
}

export type SemanticCustodyAdmission =
  | { ok: true; receipt: SemanticCustodyReceipt }
  | { ok: false; reason: SemanticCustodyFailureReason; detail?: string };

const admittedReceipts = new WeakMap<
  object,
  { receipt: SemanticCustodyReceipt; canonicalPayload: string }
>();

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? 'null' : encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bytes.slice().buffer as ArrayBuffer
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

function payloadProjection(message: SemanticCustodyMessageLike): Record<string, unknown> {
  return {
    version: message.version,
    message_id: message.message_id,
    from: message.from,
    to: message.to,
    created_at_ms: message.created_at_ms,
    action: message.action,
    nonce: message.nonce,
    pillar_slice: message.pillar_slice,
    brain_coord: message.brain_coord,
    receipt: message.receipt,
    scene_delta: message.scene_delta,
    task_state: message.task_state,
    confidence: message.confidence,
    provenance: message.provenance,
    payload: message.payload,
    parallel_slice: message.parallel_slice,
    text_boundary: message.text_boundary,
  };
}

export async function computeSemanticPayloadDigest(
  message: SemanticCustodyMessageLike
): Promise<string> {
  return sha256(canonicalize(payloadProjection(message)));
}

export async function buildSemanticCustodyBinding(
  message: SemanticCustodyMessageLike
): Promise<SemanticCustodyBindingV2> {
  if (!message.action || !message.nonce) {
    throw new Error('Semantic custody v2 requires non-empty action and nonce');
  }
  if (!message.pillar_slice.axis_1_id || !message.pillar_slice.axis_2_id) {
    throw new Error('Semantic custody v2 requires both axis IDs');
  }
  if (
    !message.provenance.surface_id ||
    !message.provenance.holokey ||
    !message.provenance.signer_address
  ) {
    throw new Error('Semantic custody v2 requires surface, HoloKey, and signer provenance');
  }

  return {
    schema: SEMANTIC_CUSTODY_SCHEMA,
    message_id: message.message_id,
    action: message.action,
    sender: message.from,
    recipient: message.to,
    nonce: message.nonce,
    axis_1_id: message.pillar_slice.axis_1_id,
    axis_2_id: message.pillar_slice.axis_2_id,
    payload_digest: await computeSemanticPayloadDigest(message),
    surface_id: message.provenance.surface_id,
    holokey: message.provenance.holokey,
  };
}

function equalAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export async function admitSemanticCustodyMessage(
  message: SemanticCustodyMessageLike,
  options: {
    verifySignedEnvelope: SemanticCustodyVerifier;
    replayStore: SemanticReplayStore;
  }
): Promise<SemanticCustodyAdmission> {
  const custody = message.custody;
  if (!custody) return { ok: false, reason: 'missing-custody' };
  if (
    custody.schema !== SEMANTIC_CUSTODY_SCHEMA ||
    custody.signed.body?.schema !== SEMANTIC_CUSTODY_SCHEMA
  ) {
    return { ok: false, reason: 'schema-version' };
  }

  const expected = await buildSemanticCustodyBinding(message);
  const signed = custody.signed;
  if (canonicalize(signed.body) !== canonicalize(expected) || signed.nonce !== expected.nonce) {
    return { ok: false, reason: 'binding-mismatch' };
  }
  if (signed.body.payload_digest !== expected.payload_digest) {
    return { ok: false, reason: 'payload-digest' };
  }

  const verification = await options.verifySignedEnvelope(signed);
  if (!verification.valid || !verification.signer) {
    return { ok: false, reason: 'signature', detail: verification.reason };
  }
  if (
    !equalAddress(verification.signer, signed.signer_address) ||
    !equalAddress(verification.signer, message.provenance.signer_address)
  ) {
    return { ok: false, reason: 'signer-mismatch' };
  }

  const claimed = await options.replayStore.claim(verification.signer, expected.nonce);
  if (!claimed) return { ok: false, reason: 'replay' };

  const receiptBody = {
    schema: 'holoscript.semantic-custody-receipt.v1' as const,
    accepted: true as const,
    message_id: expected.message_id,
    action: expected.action,
    sender: expected.sender,
    recipient: expected.recipient,
    nonce: expected.nonce,
    signer_address: verification.signer,
    payload_digest: expected.payload_digest,
  };
  const receipt: SemanticCustodyReceipt = {
    ...receiptBody,
    receipt_digest: await sha256(canonicalize(receiptBody)),
  };
  admittedReceipts.set(message, {
    receipt,
    canonicalPayload: canonicalize(payloadProjection(message)),
  });
  return { ok: true, receipt };
}

/**
 * Returns a receipt only for the exact object admitted in this process.
 * Deserializing a receipt cannot manufacture handler eligibility.
 */
export function getSemanticCustodyReceipt(message: object): SemanticCustodyReceipt | undefined {
  const admitted = admittedReceipts.get(message);
  if (!admitted) return undefined;
  const current = canonicalize(payloadProjection(message as SemanticCustodyMessageLike));
  return current === admitted.canonicalPayload ? admitted.receipt : undefined;
}
