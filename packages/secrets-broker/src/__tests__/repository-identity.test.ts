import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOLOKEY_REPOSITORY_APPROVAL_SCHEMA,
  HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA,
  HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA,
  HOLOKEY_SIGNATURE_SCHEME,
  MAX_APPROVALS,
  REPOSITORY_IDENTITY_SCHEMA,
  RepositoryIdentityAuthorityError,
  buildProvisionalRepositoryIdentity,
  buildRepositoryAuthorityIntent,
  canonicalizeRepositoryIdentityValue,
  hashRepositoryIdentityValue,
  parseRepositoryIdentity,
  projectHoloKeyIdentityEvidence,
  projectLegacyRepositoryIdentity,
  repositoryIdentityNativeTransitionTableMask,
  transitionRepositoryIdentity,
  verifyHoloKeyIdentityEvidence,
  type RepositoryAuthorityIntent,
  type RepositoryDetachedApproval,
  type RepositoryIdentity,
  type RepositoryIdentityAuthorityStore,
  type RepositoryIdentityClock,
  type RepositoryIdentityCompareAndCommitRequest,
  type RepositoryIdentityCompareAndCommitResult,
  type RepositoryIdentitySignatureVerifier,
  type RepositoryIdentityTransitionResult,
} from '../repository-identity';

const BASE_TIME = '2026-08-02T00:00:00.000Z';
const DIGEST = (character: string): string => `sha256:${character.repeat(64)}`;

class MutableClock implements RepositoryIdentityClock {
  current = BASE_TIME;

  now(): string {
    return this.current;
  }
}

function provisional(clock: RepositoryIdentityClock): RepositoryIdentity {
  return buildProvisionalRepositoryIdentity(
    {
      repository: {
        repoId: 'acme/founder-system',
        source: 'https://github.com/acme/founder-system.git',
        canonicalRef: 'main',
      },
      custody: {
        mode: 'caller-owned',
        bootstrapKeyRef: 'holokey:bootstrap-a',
        recoveryKeyRefs: ['holokey:recovery-a', 'holokey:recovery-b', 'holokey:recovery-c'],
        recoveryThreshold: 2,
      },
      soulRef: {
        schema: 'holorepo.repository-soul.v1',
        soulHash: DIGEST('a'),
        sourceDigest: DIGEST('b'),
      },
    },
    { clock }
  );
}

function signature(index: number): string {
  return `0x${index.toString(16).padStart(2, '0').repeat(65)}`;
}

function approvalsFor(intent: RepositoryAuthorityIntent): RepositoryDetachedApproval[] {
  let index = 1;
  return intent.requiredApprovals.flatMap((requirement) =>
    requirement.keyRefs.slice(0, requirement.threshold).map((keyRef) => ({
      schema: HOLOKEY_REPOSITORY_APPROVAL_SCHEMA,
      role: requirement.role,
      keyRef,
      scheme: HOLOKEY_SIGNATURE_SCHEME,
      payloadHash: intent.payloadHash,
      signature: signature(index++),
    }))
  );
}

function verifier(
  options: { sameSigner?: boolean; duplicateReceipt?: boolean } = {}
): RepositoryIdentitySignatureVerifier {
  return {
    verify(request) {
      return {
        ok: true,
        role: request.role,
        keyRef: request.keyRef,
        scheme: request.scheme,
        payloadHash: request.payloadHash,
        signingMessageHash: request.signingMessageHash,
        signatureDigest: request.signatureDigest,
        signerRef: options.sameSigner
          ? 'holokey:signer-shared'
          : `holokey:signer-${hashRepositoryIdentityValue(request.keyRef).slice(-12)}`,
        receiptDigest: options.duplicateReceipt
          ? DIGEST('d')
          : hashRepositoryIdentityValue({
              schema: 'test.signature-verification-receipt.v1',
              role: request.role,
              keyRef: request.keyRef,
              payloadHash: request.payloadHash,
              signatureDigest: request.signatureDigest,
            }),
      };
    },
  };
}

class AtomicMemoryStore implements RepositoryIdentityAuthorityStore {
  current: RepositoryIdentity;
  calls = 0;
  readonly committedByNonce = new Map<string, string>();

  constructor(initial: RepositoryIdentity) {
    this.current = initial;
  }

  compareAndCommit(
    request: RepositoryIdentityCompareAndCommitRequest
  ): RepositoryIdentityCompareAndCommitResult {
    this.calls += 1;
    const priorRequest = this.committedByNonce.get(request.nonceHash);
    let status: RepositoryIdentityCompareAndCommitResult['status'];
    if (priorRequest !== undefined) {
      status = priorRequest === request.requestHash ? 'replayed-exact' : 'conflict';
    } else if (
      request.expectedCheckpoint.identityId !== this.current.identityId ||
      request.expectedCheckpoint.identityHash !== this.current.identityHash ||
      request.expectedCheckpoint.generation !== this.current.generation ||
      request.expectedCheckpoint.state !== this.current.state ||
      request.expectedCheckpoint.transitionIntentHash !== this.current.lineage.transitionIntentHash
    ) {
      status = 'conflict';
    } else {
      status = 'committed';
      this.committedByNonce.set(request.nonceHash, request.requestHash);
      this.current = request.nextIdentity;
    }
    return {
      schema: HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA,
      status,
      requestHash: request.requestHash,
      expectedCheckpointHash: request.expectedCheckpointHash,
      nonceHash: request.nonceHash,
      payloadHash: request.payloadHash,
      intentHash: request.intentHash,
      intentIssuedAt: request.intentIssuedAt,
      intentExpiresAt: request.intentExpiresAt,
      nextIdentityHash: request.nextIdentityHash,
      transitionReceiptHash: request.transitionReceiptHash,
      receiptDigest: hashRepositoryIdentityValue({
        schema: 'test.atomic-store-receipt.v1',
        status,
        requestHash: request.requestHash,
      }),
    };
  }
}

function intentFor(
  identity: RepositoryIdentity,
  clock: RepositoryIdentityClock,
  action: 'promote' | 'rotate' | 'revoke' | 'migrate' | 'recover',
  nonceCharacter: string,
  target: unknown
): RepositoryAuthorityIntent {
  return buildRepositoryAuthorityIntent(
    {
      identity,
      action,
      nonce: nonceCharacter.repeat(32),
      ttlMs: 60 * 60 * 1_000,
      authorityRef: `authority:${action}:${identity.generation + 1}`,
      decisionRef: `decision:${action}:${identity.generation + 1}`,
      target,
    },
    { clock }
  );
}

function resealIntent(
  intent: RepositoryAuthorityIntent,
  overrides: Partial<Omit<RepositoryAuthorityIntent, 'payloadHash' | 'signingMessage'>>
): RepositoryAuthorityIntent {
  const unsealed = { ...intent, ...overrides } as Record<string, unknown>;
  delete unsealed.payloadHash;
  delete unsealed.signingMessage;
  return {
    ...unsealed,
    payloadHash: hashRepositoryIdentityValue(unsealed),
    signingMessage: canonicalizeRepositoryIdentityValue(unsealed),
  } as unknown as RepositoryAuthorityIntent;
}

async function apply(
  identity: RepositoryIdentity,
  intent: RepositoryAuthorityIntent,
  clock: RepositoryIdentityClock,
  store: RepositoryIdentityAuthorityStore,
  signatureVerifier: RepositoryIdentitySignatureVerifier = verifier()
): Promise<RepositoryIdentityTransitionResult> {
  return transitionRepositoryIdentity(
    { currentIdentity: identity, intent, approvals: approvalsFor(intent) },
    { clock, signatureVerifier, authorityStore: store }
  );
}

describe('bounded own-data canonicalization', () => {
  it('is stable across key order and rejects coercion, proxies, cycles, and sparse arrays', () => {
    expect(canonicalizeRepositoryIdentityValue({ b: 2, a: 1 })).toBe(
      canonicalizeRepositoryIdentityValue({ a: 1, b: 2 })
    );

    let getterInvoked = false;
    const getterRecord: Record<string, unknown> = {};
    Object.defineProperty(getterRecord, 'value', {
      enumerable: true,
      get() {
        getterInvoked = true;
        return 'not-data';
      },
    });
    expect(() => canonicalizeRepositoryIdentityValue(getterRecord)).toThrow(/accessors/);
    expect(getterInvoked).toBe(false);

    expect(() => canonicalizeRepositoryIdentityValue(new Proxy({ value: 1 }, {}))).toThrow(/proxy/);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalizeRepositoryIdentityValue(cycle)).toThrow(/cyclic/);
    expect(() => canonicalizeRepositoryIdentityValue([1, , 3])).toThrow(/sparse/);
    expect(() => canonicalizeRepositoryIdentityValue(-0)).toThrow(/negative zero/);
    expect(() =>
      canonicalizeRepositoryIdentityValue({ nested: { value: 1 } }, { maxDepth: 1 })
    ).toThrow(/depth/);

    let limitGetterInvoked = false;
    const limits = {};
    Object.defineProperty(limits, 'maxDepth', {
      enumerable: true,
      get() {
        limitGetterInvoked = true;
        return 10;
      },
    });
    expect(() => canonicalizeRepositoryIdentityValue({}, limits)).toThrow(/data fields/);
    expect(limitGetterInvoked).toBe(false);
  });
});

describe('HoloKey repository identity authority', () => {
  it('builds a deterministic portable provisional identity only with an explicit clock', () => {
    const clock = new MutableClock();
    const identity = provisional(clock);
    expect(identity.schema).toBe('holokey.repository-identity.v1');
    expect(identity.repository.source).toBe('https://github.com/acme/founder-system');
    expect(identity.lineage.rootIdentityId).toBe(identity.identityId);
    expect(parseRepositoryIdentity(identity)).toEqual(identity);
    expect(JSON.stringify(identity)).not.toMatch(/private.?key|bearer|C:\\|\.env/iu);

    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: identity.repository,
          custody: identity.custody,
          soulRef: identity.soulRef,
        },
        {} as { clock: RepositoryIdentityClock }
      )
    ).toThrowError(RepositoryIdentityAuthorityError);
    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: identity.repository,
          custody: identity.custody,
          soulRef: identity.soulRef,
        },
        { clock: { now: () => new Date(Number.NaN) } }
      )
    ).toThrowError(expect.objectContaining({ code: 'INVALID_CAPABILITY' }));
  });

  it('rejects a forged provisional lineage root', () => {
    const identity = provisional(new MutableClock());
    const forged = {
      ...identity,
      lineage: { ...identity.lineage, rootIdentityId: 'repository:forged-root' },
    };
    const withoutHash = { ...forged } as Record<string, unknown>;
    delete withoutHash.identityHash;
    forged.identityHash = hashRepositoryIdentityValue(withoutHash);
    expect(() => parseRepositoryIdentity(forged)).toThrow(/lineage root/);
  });

  it('applies promote, rotate, revoke, and threshold recovery through one CAS each', async () => {
    const clock = new MutableClock();
    let current = provisional(clock);
    const store = new AtomicMemoryStore(current);

    const promote = intentFor(current, clock, 'promote', '1', {
      controllerKeyRef: 'holokey:controller-a',
    });
    let result = await apply(current, promote, clock, store);
    current = result.identity;
    expect(current).toMatchObject({ state: 'active', generation: 1 });
    expect(result.transitionReceipt.intentIssuedAt).toBe(promote.issuedAt);
    expect(store.calls).toBe(1);

    clock.current = '2026-08-02T00:10:00.000Z';
    const rotate = intentFor(current, clock, 'rotate', '2', {
      controllerKeyRef: 'holokey:controller-b',
    });
    result = await apply(current, rotate, clock, store);
    current = result.identity;
    expect(current).toMatchObject({
      state: 'active',
      generation: 2,
      controllerKeyRef: 'holokey:controller-b',
    });

    clock.current = '2026-08-02T00:20:00.000Z';
    const revoke = intentFor(current, clock, 'revoke', '3', {
      reasonRef: 'incident:controller-b',
    });
    result = await apply(current, revoke, clock, store);
    current = result.identity;
    expect(current).toMatchObject({ state: 'revoked', generation: 3, controllerKeyRef: null });

    clock.current = '2026-08-02T00:30:00.000Z';
    const recover = intentFor(current, clock, 'recover', '4', {
      controllerKeyRef: 'holokey:controller-c',
    });
    expect(recover.requiredApprovals.find((item) => item.role === 'recovery')?.threshold).toBe(2);
    result = await apply(current, recover, clock, store);
    current = result.identity;
    expect(current).toMatchObject({
      state: 'active',
      generation: 4,
      controllerKeyRef: 'holokey:controller-c',
    });
    expect(current.lineage.rootIdentityId).not.toBe(current.identityHash);
    expect(store.calls).toBe(4);
  });

  it('keeps the largest recovery threshold executable and rejects the first one over', async () => {
    const clock = new MutableClock();
    const seed = provisional(clock);
    const largestRecoverySet = Array.from(
      { length: MAX_APPROVALS - 1 },
      (_, index) => `holokey:boundary-recovery-${String(index + 1).padStart(2, '0')}`
    );
    const initial = buildProvisionalRepositoryIdentity(
      {
        repository: seed.repository,
        custody: {
          mode: 'caller-owned',
          bootstrapKeyRef: 'holokey:boundary-bootstrap',
          recoveryKeyRefs: largestRecoverySet,
          recoveryThreshold: largestRecoverySet.length,
        },
        soulRef: seed.soulRef,
      },
      { clock }
    );
    const store = new AtomicMemoryStore(initial);
    const promoted = await apply(
      initial,
      intentFor(initial, clock, 'promote', 'c', {
        controllerKeyRef: 'holokey:boundary-controller',
      }),
      clock,
      store
    );
    const revoked = await apply(
      promoted.identity,
      intentFor(promoted.identity, clock, 'revoke', 'd', {
        reasonRef: 'incident:boundary-recovery',
      }),
      clock,
      store
    );
    const recoveryIntent = intentFor(revoked.identity, clock, 'recover', 'e', {
      controllerKeyRef: 'holokey:boundary-successor',
    });
    expect(approvalsFor(recoveryIntent)).toHaveLength(MAX_APPROVALS);
    const recovered = await apply(revoked.identity, recoveryIntent, clock, store);
    expect(recovered.identity).toMatchObject({
      state: 'active',
      controllerKeyRef: 'holokey:boundary-successor',
    });
    expect(store.calls).toBe(3);

    const oneOverRecoverySet = [...largestRecoverySet, 'holokey:boundary-recovery-over'];
    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: seed.repository,
          custody: {
            mode: 'caller-owned',
            bootstrapKeyRef: 'holokey:boundary-bootstrap',
            recoveryKeyRefs: oneOverRecoverySet,
            recoveryThreshold: oneOverRecoverySet.length,
          },
          soulRef: seed.soulRef,
        },
        { clock }
      )
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(store.calls).toBe(3);
  });

  it('migrates to a new repository identity while preserving the lineage root', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const store = new AtomicMemoryStore(initial);
    const promoted = await apply(
      initial,
      intentFor(initial, clock, 'promote', '5', {
        controllerKeyRef: 'holokey:controller-a',
      }),
      clock,
      store
    );
    clock.current = '2026-08-02T00:10:00.000Z';
    const migration = intentFor(promoted.identity, clock, 'migrate', '6', {
      repository: {
        repoId: 'acme/founder-system-next',
        source: 'https://github.com/acme/founder-system-next',
        canonicalRef: 'stable',
      },
      controllerKeyRef: 'holokey:controller-next',
    });
    const migrated = await apply(promoted.identity, migration, clock, store);
    expect(migrated.identity.identityId).not.toBe(promoted.identity.identityId);
    expect(migrated.identity.lineage.rootIdentityId).toBe(initial.identityId);
    expect(migrated.identity.repository.repoId).toBe('acme/founder-system-next');
  });

  it('rejects semantic no-op rotate and migrate intents', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const store = new AtomicMemoryStore(initial);
    const promoted = await apply(
      initial,
      intentFor(initial, clock, 'promote', '7', {
        controllerKeyRef: 'holokey:controller-a',
      }),
      clock,
      store
    );
    expect(() =>
      intentFor(promoted.identity, clock, 'rotate', '8', {
        controllerKeyRef: 'holokey:controller-a',
      })
    ).toThrow(/different controller/);
    expect(() =>
      intentFor(promoted.identity, clock, 'migrate', '9', {
        repository: promoted.identity.repository,
        controllerKeyRef: 'holokey:controller-b',
      })
    ).toThrow(/different repository/);
  });

  it('permits exact replay but rejects same-nonce substitution and stale forks', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const store = new AtomicMemoryStore(initial);
    const firstIntent = intentFor(initial, clock, 'promote', 'a', {
      controllerKeyRef: 'holokey:controller-a',
    });
    const substitutedIntent = intentFor(initial, clock, 'promote', 'a', {
      controllerKeyRef: 'holokey:controller-b',
    });
    const first = await apply(initial, firstIntent, clock, store);
    const replay = await apply(initial, firstIntent, clock, store);
    expect(replay.status).toBe('replayed-exact');
    await expect(apply(initial, substitutedIntent, clock, store)).rejects.toMatchObject({
      code: 'STORE_CONFLICT',
    });

    const staleIntent = intentFor(initial, clock, 'promote', 'b', {
      controllerKeyRef: 'holokey:controller-c',
    });
    await expect(apply(initial, staleIntent, clock, store)).rejects.toMatchObject({
      code: 'STORE_CONFLICT',
    });
    expect(store.current.identityHash).toBe(first.identity.identityHash);
  });

  it('serializes competing transitions so only one fork commits', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const store = new AtomicMemoryStore(initial);
    const left = intentFor(initial, clock, 'promote', 'c', {
      controllerKeyRef: 'holokey:controller-left',
    });
    const right = intentFor(initial, clock, 'promote', 'd', {
      controllerKeyRef: 'holokey:controller-right',
    });
    const outcomes = await Promise.allSettled([
      apply(initial, left, clock, store),
      apply(initial, right, clock, store),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(store.calls).toBe(2);
  });

  it('rejects missing thresholds, unauthorized extras, aliased recovery signers, and duplicate receipts before CAS', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const store = new AtomicMemoryStore(initial);
    const intent = intentFor(initial, clock, 'promote', 'e', {
      controllerKeyRef: 'holokey:controller-a',
    });
    await expect(
      transitionRepositoryIdentity(
        { currentIdentity: initial, intent, approvals: approvalsFor(intent).slice(0, 1) },
        { clock, signatureVerifier: verifier(), authorityStore: store }
      )
    ).rejects.toMatchObject({ code: 'SIGNATURE_REJECTED' });

    const extra = {
      schema: HOLOKEY_REPOSITORY_APPROVAL_SCHEMA,
      role: 'recovery',
      keyRef: 'holokey:recovery-a',
      scheme: HOLOKEY_SIGNATURE_SCHEME,
      payloadHash: intent.payloadHash,
      signature: signature(30),
    } as const;
    await expect(
      transitionRepositoryIdentity(
        { currentIdentity: initial, intent, approvals: [...approvalsFor(intent), extra] },
        { clock, signatureVerifier: verifier(), authorityStore: store }
      )
    ).rejects.toMatchObject({ code: 'APPROVAL_INVALID' });
    expect(store.calls).toBe(0);

    const committed = await apply(initial, intent, clock, store);
    clock.current = '2026-08-02T00:10:00.000Z';
    const revoke = intentFor(committed.identity, clock, 'revoke', 'f', {
      reasonRef: 'incident:test',
    });
    const revoked = await apply(committed.identity, revoke, clock, store);
    clock.current = '2026-08-02T00:20:00.000Z';
    const recover = intentFor(revoked.identity, clock, 'recover', '1', {
      controllerKeyRef: 'holokey:controller-recovered',
    });
    await expect(
      apply(revoked.identity, recover, clock, store, verifier({ sameSigner: true }))
    ).rejects.toMatchObject({ code: 'SIGNATURE_REJECTED' });
    await expect(
      apply(revoked.identity, recover, clock, store, verifier({ duplicateReceipt: true }))
    ).rejects.toMatchObject({ code: 'SIGNATURE_REJECTED' });
  });

  it('rejects expired intents and unbound authority-store receipts', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const intent = intentFor(initial, clock, 'promote', '2', {
      controllerKeyRef: 'holokey:controller-a',
    });
    clock.current = intent.expiresAt;
    await expect(
      apply(initial, intent, clock, new AtomicMemoryStore(initial))
    ).rejects.toMatchObject({
      code: 'AUTHORITY_EXPIRED',
    });

    const raceClock = new MutableClock();
    const raceInitial = provisional(raceClock);
    const raceStore = new AtomicMemoryStore(raceInitial);
    const raceIntent = intentFor(raceInitial, raceClock, 'promote', '4', {
      controllerKeyRef: 'holokey:controller-race',
    });
    const baseVerifier = verifier();
    const slowVerifier: RepositoryIdentitySignatureVerifier = {
      async verify(request) {
        const result = await baseVerifier.verify(request);
        raceClock.current = raceIntent.expiresAt;
        return result;
      },
    };
    await expect(
      apply(raceInitial, raceIntent, raceClock, raceStore, slowVerifier)
    ).rejects.toMatchObject({ code: 'AUTHORITY_EXPIRED' });
    expect(raceStore.calls).toBe(0);

    const futureClock = new MutableClock();
    const futureInitial = provisional(futureClock);
    const futureStore = new AtomicMemoryStore(futureInitial);
    const futureIntent = intentFor(futureInitial, futureClock, 'promote', '5', {
      controllerKeyRef: 'holokey:controller-future',
    });
    futureClock.current = '2026-08-01T23:59:59.999Z';
    await expect(
      apply(futureInitial, futureIntent, futureClock, futureStore)
    ).rejects.toMatchObject({ code: 'AUTHORITY_NOT_YET_VALID' });
    expect(futureStore.calls).toBe(0);

    clock.current = BASE_TIME;
    const badStore: RepositoryIdentityAuthorityStore = {
      compareAndCommit(request) {
        return {
          schema: HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA,
          status: 'committed',
          requestHash: DIGEST('0'),
          expectedCheckpointHash: request.expectedCheckpointHash,
          nonceHash: request.nonceHash,
          payloadHash: request.payloadHash,
          intentHash: request.intentHash,
          intentIssuedAt: request.intentIssuedAt,
          intentExpiresAt: request.intentExpiresAt,
          nextIdentityHash: request.nextIdentityHash,
          transitionReceiptHash: request.transitionReceiptHash,
          receiptDigest: DIGEST('1'),
        };
      },
    };
    await expect(apply(initial, intent, clock, badStore)).rejects.toMatchObject({
      code: 'STORE_RESPONSE_INVALID',
    });
  });

  it('rejects regressed identity time before signature verification or CAS', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    clock.current = '2026-08-01T23:59:59.999Z';
    expect(() =>
      intentFor(initial, clock, 'promote', '6', {
        controllerKeyRef: 'holokey:controller-regressed',
      })
    ).toThrowError(expect.objectContaining({ code: 'AUTHORITY_NOT_YET_VALID' }));

    clock.current = BASE_TIME;
    const ordinary = intentFor(initial, clock, 'promote', '7', {
      controllerKeyRef: 'holokey:controller-stale-intent',
    });
    const staleIntent = resealIntent(ordinary, {
      issuedAt: '2026-08-01T23:59:59.999Z',
      expiresAt: '2026-08-02T00:59:59.999Z',
    });
    let verifierCalls = 0;
    const countingVerifier: RepositoryIdentitySignatureVerifier = {
      verify(request) {
        verifierCalls += 1;
        return verifier().verify(request);
      },
    };
    const store = new AtomicMemoryStore(initial);
    await expect(apply(initial, staleIntent, clock, store, countingVerifier)).rejects.toMatchObject(
      { code: 'INTENT_INVALID' }
    );
    expect(verifierCalls).toBe(0);
    expect(store.calls).toBe(0);
  });

  it('rejects an intent expiry outside the four-digit canonical timestamp range', () => {
    const clock = new MutableClock();
    clock.current = '9999-12-31T23:59:59.999Z';
    const initial = provisional(clock);
    expect(() =>
      intentFor(initial, clock, 'promote', 'b', {
        controllerKeyRef: 'holokey:controller-time-boundary',
      })
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });

  it('rejects exhausted identity generations before signature verification or CAS', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const promoted = await apply(
      initial,
      intentFor(initial, clock, 'promote', '8', {
        controllerKeyRef: 'holokey:controller-generation',
      }),
      clock,
      new AtomicMemoryStore(initial)
    );
    const maxIdentityMaterial = {
      ...promoted.identity,
      generation: Number.MAX_SAFE_INTEGER,
    } as Record<string, unknown>;
    delete maxIdentityMaterial.identityHash;
    const maxIdentity = {
      ...maxIdentityMaterial,
      identityHash: hashRepositoryIdentityValue(maxIdentityMaterial),
    } as unknown as RepositoryIdentity;
    expect(parseRepositoryIdentity(maxIdentity).generation).toBe(Number.MAX_SAFE_INTEGER);
    expect(() =>
      intentFor(maxIdentity, clock, 'rotate', '9', {
        controllerKeyRef: 'holokey:controller-generation-next',
      })
    ).toThrowError(expect.objectContaining({ code: 'INTENT_INVALID' }));

    const ordinary = intentFor(promoted.identity, clock, 'rotate', 'a', {
      controllerKeyRef: 'holokey:controller-generation-forged',
    });
    const exhaustedIntent = resealIntent(ordinary, {
      subject: {
        ...ordinary.subject,
        identityHash: maxIdentity.identityHash,
        generation: Number.MAX_SAFE_INTEGER,
      },
      sequence: Number.MAX_SAFE_INTEGER + 1,
    });
    let verifierCalls = 0;
    const countingVerifier: RepositoryIdentitySignatureVerifier = {
      verify(request) {
        verifierCalls += 1;
        return verifier().verify(request);
      },
    };
    const store = new AtomicMemoryStore(maxIdentity);
    await expect(
      apply(maxIdentity, exhaustedIntent, clock, store, countingVerifier)
    ).rejects.toMatchObject({ code: 'INTENT_INVALID' });
    expect(verifierCalls).toBe(0);
    expect(store.calls).toBe(0);
  });

  it('keeps malformed values and secret-shaped fields out of identity records', () => {
    const clock = new MutableClock();
    const base = provisional(clock);
    const poisoned = {
      repository: base.repository,
      custody: { ...base.custody, privateKey: 'do-not-store-this' },
      soulRef: base.soulRef,
    };
    let error: unknown;
    try {
      buildProvisionalRepositoryIdentity(poisoned, { clock });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RepositoryIdentityAuthorityError);
    expect(JSON.stringify(error)).not.toContain('do-not-store-this');
    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: { ...base.repository, source: 'https://token@example.com/repo' },
          custody: base.custody,
          soulRef: base.soulRef,
        },
        { clock }
      )
    ).toThrow(/credential-free/);
    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: {
            ...base.repository,
            source: `https://github.com/acme/ghp_${'a'.repeat(32)}/repo`,
          },
          custody: base.custody,
          soulRef: base.soulRef,
        },
        { clock }
      )
    ).toThrow(/credential-free/);
    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: base.repository,
          custody: {
            ...base.custody,
            bootstrapKeyRef: `holokey:${'a'.repeat(64)}`,
          },
          soulRef: base.soulRef,
        },
        { clock }
      )
    ).toThrow(/cannot contain key material/);
    expect(() =>
      buildProvisionalRepositoryIdentity(
        {
          repository: base.repository,
          custody: {
            ...base.custody,
            bootstrapKeyRef: `0x${'a'.repeat(64)}`,
          },
          soulRef: base.soulRef,
        },
        { clock }
      )
    ).toThrow(/holokey:/);
  });

  it.each([
    [
      'percent-encoded token',
      `https://github.com/acme/ghp_%61${'a'.repeat(31)}/repo`,
      `ghp_${'a'.repeat(32)}`,
    ],
    [
      'double-encoded token',
      `https://github.com/acme/ghp_%2561${'a'.repeat(31)}/repo`,
      `ghp_${'a'.repeat(32)}`,
    ],
    ['encoded traversal', 'https://github.com/acme/safe/%2e%2e/private', '../private'],
    ['encoded control', 'https://github.com/acme/safe/%0Aprivate', '\nprivate'],
    ['normalizer-introduced escape', 'https://github.com/acme/repo name', 'repo%20name'],
  ])('rejects %s repository sources without reflecting the input', (_case, source, decoded) => {
    const clock = new MutableClock();
    const base = provisional(clock);
    let error: unknown;
    try {
      buildProvisionalRepositoryIdentity(
        {
          repository: { ...base.repository, source },
          custody: base.custody,
          soulRef: base.soulRef,
        },
        { clock }
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RepositoryIdentityAuthorityError);
    expect(error).toMatchObject({ code: 'INVALID_INPUT' });
    expect((error as Error).message).toBe(
      'repository.source must be a credential-free http(s) URL'
    );
    expect(String(error)).not.toContain(source);
    expect(String(error)).not.toContain(decoded);
  });

  it('requires a same-module contract result for deprecated HoloRepo projections', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const intent = intentFor(initial, clock, 'promote', '3', {
      controllerKeyRef: 'holokey:controller-a',
    });
    const transitioned = await apply(initial, intent, clock, new AtomicMemoryStore(initial));
    const projection = projectLegacyRepositoryIdentity(transitioned);
    expect(projection.schema).toBe(REPOSITORY_IDENTITY_SCHEMA);
    expect(projection.authorityBoundary).toEqual({
      requiredDurableIdentityAuthority: 'HoloKey',
      evidence: 'local-bootstrap-contract-only',
      authenticatedDurableReadback: false,
      compatibilityOnly: true,
      issuesIdentity: false,
      mutatesIdentity: false,
    });

    expect(() => projectLegacyRepositoryIdentity({ ...transitioned })).toThrowError(
      /same-module HoloKey contract result/
    );

    const forgedIdentityWithoutHash = {
      ...transitioned.identity,
      controllerKeyRef: 'holokey:attacker-controller',
    } as Record<string, unknown>;
    delete forgedIdentityWithoutHash.identityHash;
    const forgedIdentity = {
      ...forgedIdentityWithoutHash,
      identityHash: hashRepositoryIdentityValue(forgedIdentityWithoutHash),
    };
    const forgedReceiptWithoutHash = {
      ...transitioned.transitionReceipt,
      previousIdentityHash: forgedIdentity.lineage
        ? (forgedIdentity.lineage as { previousIdentityHash: string }).previousIdentityHash
        : DIGEST('8'),
      nextIdentityHash: forgedIdentity.identityHash,
      approvalReceiptDigests: [DIGEST('1'), DIGEST('2')],
    } as Record<string, unknown>;
    delete forgedReceiptWithoutHash.receiptHash;
    const forgedReceipt = {
      ...forgedReceiptWithoutHash,
      receiptHash: hashRepositoryIdentityValue(forgedReceiptWithoutHash),
    };
    const forgedResult = {
      status: 'committed' as const,
      identity: forgedIdentity,
      transitionReceipt: forgedReceipt,
      storeReceipt: {
        ...transitioned.storeReceipt,
        nextIdentityHash: forgedIdentity.identityHash,
        transitionReceiptHash: forgedReceipt.receiptHash,
      },
    };
    expect(() =>
      projectLegacyRepositoryIdentity(forgedResult as unknown as RepositoryIdentityTransitionResult)
    ).toThrowError(/same-module HoloKey contract result/);

    expect(projectLegacyRepositoryIdentity(initial).schema).toBe(REPOSITORY_IDENTITY_SCHEMA);
    expect(() => projectLegacyRepositoryIdentity({ ...initial })).toThrowError(
      /same-module HoloKey contract result/
    );
  });

  it('labels fake verifier/store output as local contract evidence, not durable HoloKey readback', async () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const intent = intentFor(initial, clock, 'promote', '4', {
      controllerKeyRef: 'holokey:controller-a',
    });
    const transitioned = await apply(initial, intent, clock, new AtomicMemoryStore(initial));

    expect(transitioned.authorityEvidence).toBe('caller-injected-contract-capabilities');
    expect(
      projectLegacyRepositoryIdentity(transitioned).authorityBoundary.authenticatedDurableReadback
    ).toBe(false);
  });

  it('verifies and projects an explicit read-only HoloKey evidence envelope', () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    const evidence = {
      schema: HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA,
      authority: 'HoloKey',
      authorityEvidence: 'caller-injected-contract-capabilities',
      authenticatedDurableReadback: false,
      identity: initial,
    } as const;

    const verification = verifyHoloKeyIdentityEvidence(evidence);
    expect(verification.ok).toBe(true);
    expect(verification.authority).toBe('HoloKey');
    expect(verification.identityHash).toBe(initial.identityHash);
    expect(verification.authenticatedDurableReadback).toBe(false);
    expect(verification.issuesIdentity).toBe(false);
    expect(verification.persistsIdentity).toBe(false);
    expect(verification.mutatesIdentity).toBe(false);

    const projection = projectHoloKeyIdentityEvidence(evidence);
    expect(projection.schema).toBe(REPOSITORY_IDENTITY_SCHEMA);
    expect(projection.identityId).toBe(initial.identityId);
    expect(projection.identityHash).not.toBe(initial.identityHash);
    expect(projection.authorityBoundary).toMatchObject({
      requiredDurableIdentityAuthority: 'HoloKey',
      evidence: 'caller-injected-contract-capabilities',
      authenticatedDurableReadback: false,
      compatibilityOnly: true,
      issuesIdentity: false,
      mutatesIdentity: false,
    });
    expect(() => projectHoloKeyIdentityEvidence({ ...evidence, identity: { ...initial, state: 'active' } }))
      .toThrowError();
  });

  it('rejects a caller-asserted durable readback without an HoloKey root receipt', () => {
    const clock = new MutableClock();
    const initial = provisional(clock);
    expect(() => verifyHoloKeyIdentityEvidence({
      schema: HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA,
      authority: 'HoloKey',
      authorityEvidence: 'authenticated-durable-readback',
      authenticatedDurableReadback: true,
      identity: initial,
    })).toThrowError(/durable readback/);
  });

  it('exposes the reviewed complete 15-bit transition-table mask', () => {
    expect(repositoryIdentityNativeTransitionTableMask()).toBe(16_833);
  });

  it('publishes the bounded native SHA-256 byte-binding entrypoint', () => {
    const source = readFileSync(new URL('../repository_identity.hsplus', import.meta.url), 'utf8');
    expect(source.match(/^export function /gmu)).toHaveLength(4);
    expect(source).toContain('export function repository_identity_sha256_byte');
  });
});
