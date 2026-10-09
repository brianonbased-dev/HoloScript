/**
 * Rules for the protocol registry's records: POST /api/publish, POST /api/protocol,
 * POST /api/protocol/metadata and POST /api/collect/:hash in http-server.ts.
 *
 * - Who owns a content hash, and who may replace what is stored under it. An operator replaces
 *   another principal's hash only when its body says so (saysReplaceOwned).
 * - What a caller who is not an operator must send to claim a hash: the content itself.
 * - Which fields a caller may set on a record. Scene links, the edition count and the owner are
 *   the server's.
 * - What collect may trust from a stored record.
 *
 * Owners are kept BESIDE the records (http-server.ts protocolRecordOwners and
 * protocolMetadataOwners), never inside them, so no read route can serialize one. An owner is an
 * OAuth client id or agent id, and for a public OAuth client the client id is close to a
 * credential: a reviewer minted a token from one read off a public GET (board task zeoq).
 */

import { createHash } from 'crypto';
import type { TokenIntrospection } from './oauth21';

/**
 * The body field an OPERATOR may send to set or clear a record's owner. Every other caller's
 * value is ignored, and no stored record or metadata entry carries a field by this name.
 */
export const PUBLISHER_PRINCIPAL_FIELD = 'publisherPrincipal';

/**
 * The body field an OPERATOR sends (`true`) to replace a record another principal owns without
 * moving its owner, as a moderation does. Every other caller's value is ignored, and it is never
 * stored.
 */
export const REPLACE_OWNED_FIELD = 'replaceOwned';

/**
 * Did this body say, on purpose, that it replaces a hash another principal owns? Only an
 * operator's body is asked. An operator key is also what a relay holds: Studio sends every
 * signed-in user's publish under its one server key, and holo_protocol_publish and the secrets
 * broker use the server's key. None of them sends either field, so none of them can overwrite a
 * record another account owns; an operator who means to sends `publisherPrincipal` (which also
 * says who owns it afterwards) or `replaceOwned: true` (which keeps the owner).
 */
export function saysReplaceOwned(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, PUBLISHER_PRINCIPAL_FIELD) ||
    body[REPLACE_OWNED_FIELD] === true
  );
}

/**
 * The stable id a record remembers its publisher by. TokenIntrospection carries no `sub` or
 * username; it carries `agentId` and `clientId`, and http-server already binds MCP tool calls to
 * `agentId ?? clientId` (signer, callerId), so the record uses the same principal. `agentId` is
 * stamped only when bound at registration or proven by the agent's own key (oauth2-provider
 * agentIdBindingAllowed), and for a GitHub login it is `github:<numeric id>`, which survives a
 * username rename. `clientId` is server-issued at /oauth/register.
 */
export function publisherPrincipalOf(auth: TokenIntrospection): string | undefined {
  return auth.agentId || auth.clientId || undefined;
}

/**
 * May this caller replace what is stored under a content hash? Nothing stored: yes. The principal
 * that owns it: yes. Anyone else who is not an operator: no. An operator may replace a hash it
 * does not own, including one with no owner (cleared by an operator, or stored before records had
 * one), only `onPurpose` (saysReplaceOwned), because an operator key is also what relays hold
 * (Studio's signed-in publishing, holo_protocol_publish). Otherwise clearing a hash's owner would
 * open it to every relay.
 */
export function mayReplaceProtocolRecord(
  exists: boolean,
  owner: string | undefined,
  principal: string | undefined,
  isOperator: boolean,
  onPurpose = false
): boolean {
  if (!exists) return true;
  const hasOwner = typeof owner === 'string' && owner !== '';
  if (hasOwner && owner === principal) return true;
  if (!isOperator) return false;
  return onPurpose;
}

/** The owner a write leaves behind, or why an operator's request for one was refused. */
export type OwnerChoice = { owner: string | undefined } | { error: string };

/**
 * Who owns a hash after this write. A new hash belongs to its writer. A replaced one keeps its
 * owner, including when an operator replaces it, so a moderation does not quietly move ownership.
 * Only an operator may name the owner outright: `publisherPrincipal: "<principal>"` gives the hash
 * to that principal, `publisherPrincipal: null` leaves it with nobody (from then on, only an
 * operator writing on purpose). Anyone else's `publisherPrincipal` is ignored.
 */
export function nextProtocolRecordOwner(params: {
  exists: boolean;
  existingOwner: string | undefined;
  principal: string | undefined;
  isOperator: boolean;
  body: Record<string, unknown>;
}): OwnerChoice {
  const { exists, existingOwner, principal, isOperator, body } = params;
  if (isOperator && Object.prototype.hasOwnProperty.call(body, PUBLISHER_PRINCIPAL_FIELD)) {
    const asked = body[PUBLISHER_PRINCIPAL_FIELD];
    if (asked === null) return { owner: undefined };
    if (typeof asked === 'string' && asked.trim() !== '') return { owner: asked.trim() };
    return {
      error: `${PUBLISHER_PRINCIPAL_FIELD} must be a principal (a non-empty string), or null to leave the hash with no owner.`,
    };
  }
  return { owner: exists ? existingOwner : principal };
}

const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * The hashes a piece of content may be published under: sha256 of the text as sent (what Studio
 * route.ts and POST /api/publish compute) and of the text with CRLF line ends made LF (what core
 * deploy/provenance.ts computeContentHash gives the CLI and the protocol tools). Both are computed
 * from the content, so either proves the caller has it.
 */
export function contentHashesOf(content: string): string[] {
  const asSent = sha256Hex(content);
  if (!content.includes('\r\n')) return [asSent];
  const lf = sha256Hex(content.replace(/\r\n/g, '\n'));
  return lf === asSent ? [asSent] : [asSent, lf];
}

/** Why a caller's content does not prove its content hash, or `null` when it does. */
export type ContentProofRefusal = {
  error: 'content_required' | 'content_not_text' | 'content_hash_mismatch';
  message: string;
};

/**
 * A caller who is not an operator claims a content hash only by sending the content: `source`
 * and/or `code`, and every one it sends must be text that hashes to `contentHash`. A bare hash
 * would let anyone pre-claim the hash of code they do not have (a template, a starter scene) and
 * lock its real author out with 409. A field that is not text is refused, not skipped: the record
 * stores both fields, so an object or array in one would be served as content nobody checked.
 */
export function contentProofRefusal(
  body: Record<string, unknown>,
  contentHash: string
): ContentProofRefusal | null {
  for (const field of ['source', 'code'] as const) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return {
        error: 'content_not_text',
        message: `"${field}" must be the content as a string.`,
      };
    }
  }
  const sent = (['source', 'code'] as const).filter((field) => typeof body[field] === 'string');
  if (sent.length === 0) {
    return {
      error: 'content_required',
      message:
        'Send the content ("source" or "code") with its contentHash. Only an operator (tools:admin) may register a hash without it.',
    };
  }
  for (const field of sent) {
    if (!contentHashesOf(body[field] as string).includes(contentHash)) {
      return {
        error: 'content_hash_mismatch',
        message: `contentHash is not the sha256 of "${field}".`,
      };
    }
  }
  return null;
}

/**
 * The fields a caller may set on a protocol record, taken from what the real callers send:
 * Studio app/api/publish/route.ts, mcp-server protocol-tools.ts and secrets-broker-routes.ts,
 * core cli/holoscript-runner.ts and marketplace-api ProtocolRegistry.ts. `contentHash` and
 * `timestamp` are set by the route itself. Scene links (sceneId, sceneUrl, embedUrl), the
 * edition count and the owner are never taken from a body.
 */
export const PROTOCOL_RECORD_BODY_FIELDS = [
  'author',
  'title',
  'description',
  'license',
  'price',
  'publishMode',
  'importHashes',
  'referralBps',
  'metadataURI',
  'mintAsNFT',
  'source',
  'code',
] as const;

/** The allowed fields of a POST /api/protocol body, plus a timestamp that is a real number. */
export function protocolRecordFieldsFromBody(
  body: Record<string, unknown>,
  now: number = Date.now()
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const field of PROTOCOL_RECORD_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      fields[field] = body[field];
    }
  }
  const sentAt = body.timestamp;
  fields.timestamp = typeof sentAt === 'number' && Number.isFinite(sentAt) ? sentAt : now;
  return fields;
}

/**
 * A metadata body as stored and served: everything the caller sent except the operator's
 * ownership fields.
 */
export function metadataForStorage(body: Record<string, unknown>): Record<string, unknown> {
  const stored: Record<string, unknown> = { ...body };
  delete stored[PUBLISHER_PRINCIPAL_FIELD];
  delete stored[REPLACE_OWNED_FIELD];
  return stored;
}

/**
 * POST /api/protocol is creating the first record for a hash that already has metadata. Is that
 * metadata kept? Only when it was stored by the record's writer or its new owner. Metadata anyone
 * else stored first is dropped, so their provenance is not served beside the real author's record
 * (POST /api/publish overwrites the metadata anyway). Metadata whose writer is unknown is dropped.
 */
export function keepsPreRecordMetadata(
  metadataOwner: string | undefined,
  writer: string | undefined,
  newOwner: string | undefined
): boolean {
  if (typeof metadataOwner !== 'string' || metadataOwner === '') return false;
  return metadataOwner === writer || metadataOwner === newOwner;
}

/** The scene a record points at, only when the server stored one (`sceneId` is server-set). */
export function storedSceneIdOf(record: Record<string, unknown> | undefined): string | null {
  const id = record?.sceneId;
  return typeof id === 'string' && id !== '' ? id : null;
}

/** The public URL of the scene the server stored for a record, or null. */
export function storedSceneUrlOf(
  record: Record<string, unknown> | undefined,
  baseUrl: string
): string | null {
  const id = storedSceneIdOf(record);
  return id ? `${baseUrl}/scene/${id}` : null;
}

/**
 * How many editions a stored record has had collected. Anything that is not a whole number of at
 * least 0 counts as none, so a bad stored value can neither concatenate (`'x' + 1`) nor go
 * negative.
 */
export function storedEditionCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** The 409 body for a refused replacement. Nothing was written when this is sent. */
export function alreadyPublishedBody(
  contentHash: string,
  existingUrl: string | null
): Record<string, unknown> {
  return {
    error: 'already_published',
    contentHash,
    existingUrl,
    message:
      'This content hash is already published by another account, and only its publisher can replace it. ' +
      'If this code is yours, an operator (tools:admin) can reassign the hash to you: ' +
      'see "Who owns a content hash" in docs/api/REST_EXAMPLES.md.',
  };
}
