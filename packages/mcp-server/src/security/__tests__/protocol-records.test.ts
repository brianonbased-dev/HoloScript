/**
 * The protocol registry's record rules on their own (security/protocol-records.ts). The real
 * server test (http-route-publish-ownership.test.ts) covers the routes; these pin the cases a
 * route cannot reach: a hash with no owner, a token with no principal, and a stored edition count
 * that is not a count (POST /api/protocol no longer lets a body set one, so only a future durable
 * store or a bug could bring one back).
 */

import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  contentHashesOf,
  contentProofRefusal,
  keepsPreRecordMetadata,
  mayReplaceProtocolRecord,
  metadataForStorage,
  nextProtocolRecordOwner,
  protocolRecordFieldsFromBody,
  PUBLISHER_PRINCIPAL_FIELD,
  publisherPrincipalOf,
  REPLACE_OWNED_FIELD,
  saysReplaceOwned,
  storedEditionCount,
  storedSceneUrlOf,
} from '../protocol-records';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('mayReplaceProtocolRecord', () => {
  it('a new hash is anyone-with-write', () => {
    expect(mayReplaceProtocolRecord(false, undefined, 'client_mallory', false)).toBe(true);
  });

  it('the owner may republish; another principal may not, even saying it means to', () => {
    expect(mayReplaceProtocolRecord(true, 'client_alice', 'client_alice', false)).toBe(true);
    expect(mayReplaceProtocolRecord(true, 'client_alice', 'client_mallory', false)).toBe(false);
    expect(mayReplaceProtocolRecord(true, 'client_alice', 'client_mallory', false, true)).toBe(
      false
    );
  });

  it("an operator replaces another principal's hash only on purpose; its own, always", () => {
    expect(mayReplaceProtocolRecord(true, 'agent_tenant', 'legacy-api-key', true)).toBe(false);
    expect(mayReplaceProtocolRecord(true, 'agent_tenant', 'legacy-api-key', true, true)).toBe(true);
    expect(mayReplaceProtocolRecord(true, 'legacy-api-key', 'legacy-api-key', true)).toBe(true);
  });

  it('a hash with no owner is replaced by an operator only, and only on purpose', () => {
    expect(mayReplaceProtocolRecord(true, undefined, 'client_mallory', false)).toBe(false);
    expect(mayReplaceProtocolRecord(true, undefined, undefined, false)).toBe(false);
    expect(mayReplaceProtocolRecord(true, '', '', false)).toBe(false);
    expect(mayReplaceProtocolRecord(true, undefined, 'client_mallory', false, true)).toBe(false);
    // A relay holding the operator key must not reach a hash an operator cleared.
    expect(mayReplaceProtocolRecord(true, undefined, 'legacy-api-key', true)).toBe(false);
    expect(mayReplaceProtocolRecord(true, undefined, 'legacy-api-key', true, true)).toBe(true);
  });

  it('a caller with no principal owns nothing', () => {
    expect(mayReplaceProtocolRecord(true, 'client_alice', undefined, false)).toBe(false);
  });
});

describe('nextProtocolRecordOwner', () => {
  const base = { existingOwner: 'client_alice', principal: 'client_mallory' };

  it('a new hash belongs to its writer; a replaced one keeps its owner, even for an operator', () => {
    expect(
      nextProtocolRecordOwner({ ...base, exists: false, isOperator: false, body: {} })
    ).toEqual({ owner: 'client_mallory' });
    expect(nextProtocolRecordOwner({ ...base, exists: true, isOperator: true, body: {} })).toEqual({
      owner: 'client_alice',
    });
    expect(
      nextProtocolRecordOwner({
        exists: true,
        existingOwner: undefined,
        principal: 'legacy-api-key',
        isOperator: true,
        body: {},
      })
    ).toEqual({ owner: undefined });
  });

  it('only an operator may name the owner, or clear it with null', () => {
    const naming = { [PUBLISHER_PRINCIPAL_FIELD]: 'client_carol' };
    expect(
      nextProtocolRecordOwner({ ...base, exists: true, isOperator: true, body: naming })
    ).toEqual({ owner: 'client_carol' });
    expect(
      nextProtocolRecordOwner({
        ...base,
        exists: true,
        isOperator: true,
        body: { [PUBLISHER_PRINCIPAL_FIELD]: null },
      })
    ).toEqual({ owner: undefined });
    expect(
      nextProtocolRecordOwner({ ...base, exists: false, isOperator: false, body: naming })
    ).toEqual({ owner: 'client_mallory' });
    expect(
      nextProtocolRecordOwner({ ...base, exists: true, isOperator: false, body: naming })
    ).toEqual({ owner: 'client_alice' });
  });

  it('an operator naming something that is not a principal gets an error, not an owner', () => {
    for (const asked of [42, '', '  ', {}, ['client_carol']]) {
      const choice = nextProtocolRecordOwner({
        ...base,
        exists: true,
        isOperator: true,
        body: { [PUBLISHER_PRINCIPAL_FIELD]: asked },
      });
      expect('error' in choice, JSON.stringify(asked)).toBe(true);
    }
  });
});

describe('saysReplaceOwned', () => {
  it('publisherPrincipal (any value, even null) or replaceOwned: true, and nothing looser', () => {
    expect(saysReplaceOwned({ [PUBLISHER_PRINCIPAL_FIELD]: 'agent_x' })).toBe(true);
    expect(saysReplaceOwned({ [PUBLISHER_PRINCIPAL_FIELD]: null })).toBe(true);
    expect(saysReplaceOwned({ [REPLACE_OWNED_FIELD]: true })).toBe(true);
    for (const loose of ['true', 1, 'yes', {}, false, null]) {
      expect(saysReplaceOwned({ [REPLACE_OWNED_FIELD]: loose }), JSON.stringify(loose)).toBe(false);
    }
    expect(saysReplaceOwned({})).toBe(false);
  });
});

describe('contentProofRefusal', () => {
  const code = 'object Orb { @glowing }';

  it('no content: refused; content that hashes to the claim: accepted', () => {
    expect(contentProofRefusal({}, sha(code))?.error).toBe('content_required');
    expect(contentProofRefusal({ source: code }, sha(code))).toBeNull();
    expect(contentProofRefusal({ code }, sha(code))).toBeNull();
    expect(contentProofRefusal({ source: code, code }, sha(code))).toBeNull();
  });

  it('every content field sent must match', () => {
    expect(contentProofRefusal({ source: code }, sha('other'))?.error).toBe(
      'content_hash_mismatch'
    );
    expect(contentProofRefusal({ code, source: 'other' }, sha(code))?.error).toBe(
      'content_hash_mismatch'
    );
  });

  it('a source or code that is not text is refused, even beside a field that proves the hash', () => {
    for (const notText of [42, null, { injected: true }, ['alt', 'content'], true]) {
      const label = JSON.stringify(notText);
      expect(contentProofRefusal({ source: notText }, sha(code))?.error, label).toBe(
        'content_not_text'
      );
      expect(contentProofRefusal({ code, source: notText }, sha(code))?.error, label).toBe(
        'content_not_text'
      );
      expect(contentProofRefusal({ source: code, code: notText }, sha(code))?.error, label).toBe(
        'content_not_text'
      );
    }
  });

  it("accepts the hash as sent and core's CRLF-to-LF hash, nothing looser", () => {
    const crlf = 'a\r\nb\r\n';
    expect(contentHashesOf(crlf)).toEqual([sha(crlf), sha('a\nb\n')]);
    expect(contentHashesOf('a\nb')).toEqual([sha('a\nb')]);
    expect(contentProofRefusal({ code: crlf }, sha('a\nb\n'))).toBeNull();
    expect(contentProofRefusal({ code: 'a\nb\n' }, sha(crlf))?.error).toBe('content_hash_mismatch');
  });
});

describe('protocolRecordFieldsFromBody', () => {
  it('keeps the fields callers send and drops scene links, edition count, owner and the rest', () => {
    const fields = protocolRecordFieldsFromBody(
      {
        author: 'alice',
        price: '0',
        source: 's',
        code: 'c',
        referralBps: 250,
        sceneUrl: 'https://example.invalid',
        embedUrl: 'https://example.invalid',
        sceneId: 'planted',
        editionCount: -5,
        [PUBLISHER_PRINCIPAL_FIELD]: 'client_alice',
        contentHash: 'set-by-the-route',
        visibility: 'planted',
        timestamp: 12,
      },
      99
    );
    expect(fields).toEqual({
      author: 'alice',
      price: '0',
      source: 's',
      code: 'c',
      referralBps: 250,
      timestamp: 12,
    });
  });

  it('a timestamp that is not a finite number becomes now', () => {
    for (const timestamp of ['yesterday', Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(protocolRecordFieldsFromBody({ timestamp }, 99).timestamp).toBe(99);
    }
  });
});

describe('what reads and collect may trust', () => {
  it("stored metadata never carries an owner field or an operator's replace flag", () => {
    expect(
      metadataForStorage({
        provenance: { hash: 'h' },
        [PUBLISHER_PRINCIPAL_FIELD]: 'client_x',
        [REPLACE_OWNED_FIELD]: true,
      })
    ).toEqual({ provenance: { hash: 'h' } });
  });

  it("a first record keeps metadata its writer or new owner stored, and drops anyone else's", () => {
    expect(keepsPreRecordMetadata('client_alice', 'client_alice', 'client_alice')).toBe(true);
    // An operator stored it, then created the record and handed it to alice.
    expect(keepsPreRecordMetadata('legacy-api-key', 'legacy-api-key', 'client_alice')).toBe(true);
    // An operator created the record for mallory, who had stored the metadata.
    expect(keepsPreRecordMetadata('client_mallory', 'legacy-api-key', 'client_mallory')).toBe(true);
    expect(keepsPreRecordMetadata('client_mallory', 'client_alice', 'client_alice')).toBe(false);
    expect(keepsPreRecordMetadata(undefined, 'client_alice', 'client_alice')).toBe(false);
    expect(keepsPreRecordMetadata(undefined, undefined, undefined)).toBe(false);
    expect(keepsPreRecordMetadata('', '', '')).toBe(false);
  });

  it('a scene URL comes only from a stored scene id', () => {
    expect(storedSceneUrlOf({ sceneId: 'abc', sceneUrl: 'https://evil' }, 'https://h')).toBe(
      'https://h/scene/abc'
    );
    expect(storedSceneUrlOf({ sceneUrl: 'https://evil' }, 'https://h')).toBeNull();
    expect(storedSceneUrlOf(undefined, 'https://h')).toBeNull();
  });

  it('a stored edition count that is not a whole number of at least 0 counts as none', () => {
    for (const bad of [
      'x',
      '3',
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      2 ** 53,
      null,
      {},
    ]) {
      expect(storedEditionCount(bad), JSON.stringify(bad)).toBe(0);
    }
    expect(storedEditionCount(undefined)).toBe(0);
    expect(storedEditionCount(0)).toBe(0);
    expect(storedEditionCount(7)).toBe(7);
  });
});

describe('publisherPrincipalOf', () => {
  it('is the agent when one is bound, else the client, the same id MCP tool calls bind to', () => {
    expect(
      publisherPrincipalOf({ active: true, agentId: 'github:4242', clientId: 'github:octo' })
    ).toBe('github:4242');
    expect(publisherPrincipalOf({ active: true, clientId: 'client_abc' })).toBe('client_abc');
    expect(publisherPrincipalOf({ active: true })).toBeUndefined();
  });
});
