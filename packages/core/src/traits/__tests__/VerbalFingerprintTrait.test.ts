import { describe, it, expect, beforeEach } from 'vitest';
import { verbalFingerprintHandler } from '../VerbalFingerprintTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('VerbalFingerprintTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('vf-1');
    ctx = createMockContext();
  });

  it('emits ready on attach with config defaults', () => {
    attachTrait(verbalFingerprintHandler, node, {}, ctx);
    const ev = getLastEvent(ctx, 'verbal_fingerprint_ready');
    expect(ev).toBeDefined();
    expect(ev.fingerprintKey).toBe('default');
    expect(ev.enforce).toBe(false);
    expect(ev.rollingWindow).toBe(50);
  });

  it('verifies style and records a matched result', () => {
    attachTrait(verbalFingerprintHandler, node, {}, ctx);
    sendEvent(verbalFingerprintHandler, node, {}, ctx, {
      type: 'verbal_fingerprint_verify',
      text: 'The quick brown fox jumps over the lazy dog.',
      generationId: 'g1',
      modelBackend: 'claude',
    });
    expect(getEventCount(ctx, 'verbal_fingerprint_verified')).toBe(1);
    const ev = getLastEvent(ctx, 'verbal_fingerprint_verified');
    expect(ev.matched).toBe(true);
    expect(ev.mismatches).toEqual([]);
    expect(ev.rollingAccuracy).toBe(1);
  });

  it('emits a deterministic stable text hash for repeated text', () => {
    attachTrait(verbalFingerprintHandler, node, {}, ctx);
    const text = 'A stable stylistic sample should keep the same fingerprint.';

    sendEvent(verbalFingerprintHandler, node, {}, ctx, {
      type: 'verbal_fingerprint_verify',
      text,
      generationId: 'g-hash-1',
      modelBackend: 'claude',
    });
    const first = getLastEvent(ctx, 'verbal_fingerprint_verified');

    sendEvent(verbalFingerprintHandler, node, {}, ctx, {
      type: 'verbal_fingerprint_verify',
      text,
      generationId: 'g-hash-2',
      modelBackend: 'gpt',
    });
    const second = getLastEvent(ctx, 'verbal_fingerprint_verified');

    expect(first.textHash).toMatch(/^fnv1a32:[0-9a-f]{8}:\d+$/);
    expect(second.textHash).toBe(first.textHash);
  });

  it('separates equal-length text with the same first eight characters', () => {
    attachTrait(verbalFingerprintHandler, node, {
      style: {
        label: 'hash-test',
        minSentenceLength: 1,
        maxSentenceLength: 100,
        forbiddenPhrases: [],
        requiredPhrases: [],
        tone: 'test',
      },
    }, ctx);

    sendEvent(verbalFingerprintHandler, node, {
      style: {
        label: 'hash-test',
        minSentenceLength: 1,
        maxSentenceLength: 100,
        forbiddenPhrases: [],
        requiredPhrases: [],
        tone: 'test',
      },
    }, ctx, {
      type: 'verbal_fingerprint_verify',
      text: 'abcdefgh alpha.',
      generationId: 'g-prefix-1',
      modelBackend: 'claude',
    });
    const first = getLastEvent(ctx, 'verbal_fingerprint_verified');

    sendEvent(verbalFingerprintHandler, node, {
      style: {
        label: 'hash-test',
        minSentenceLength: 1,
        maxSentenceLength: 100,
        forbiddenPhrases: [],
        requiredPhrases: [],
        tone: 'test',
      },
    }, ctx, {
      type: 'verbal_fingerprint_verify',
      text: 'abcdefgh omega.',
      generationId: 'g-prefix-2',
      modelBackend: 'gpt',
    });
    const second = getLastEvent(ctx, 'verbal_fingerprint_verified');

    expect('abcdefgh alpha.'.length).toBe('abcdefgh omega.'.length);
    expect(first.textHash).not.toBe(second.textHash);
  });

  it('rejects text with forbidden phrases when enforce=true (false-case)', () => {
    attachTrait(verbalFingerprintHandler, node, {
      enforce: true,
      style: {
        label: 'test',
        minSentenceLength: 1,
        maxSentenceLength: 100,
        forbiddenPhrases: ['forbidden'],
        requiredPhrases: [],
        tone: 'test',
      },
    }, ctx);
    sendEvent(verbalFingerprintHandler, node, {
      enforce: true,
      style: {
        label: 'test',
        minSentenceLength: 1,
        maxSentenceLength: 100,
        forbiddenPhrases: ['forbidden'],
        requiredPhrases: [],
        tone: 'test',
      },
    }, ctx, {
      type: 'verbal_fingerprint_verify',
      text: 'This contains a forbidden word.',
      generationId: 'g2',
      modelBackend: 'claude',
    });
    expect(getEventCount(ctx, 'verbal_fingerprint_rejected')).toBe(1);
    const ev = getLastEvent(ctx, 'verbal_fingerprint_rejected');
    expect(ev.mismatches).toContain('forbidden_phrase:forbidden');
  });

  it('responds to query with current state', () => {
    attachTrait(verbalFingerprintHandler, node, {}, ctx);
    sendEvent(verbalFingerprintHandler, node, {}, ctx, {
      type: 'verbal_fingerprint_verify',
      text: 'This is a sufficiently long sentence that should meet the default minimum length requirement easily.',
      generationId: 'g3',
      modelBackend: 'gpt',
    });
    sendEvent(verbalFingerprintHandler, node, {}, ctx, {
      type: 'verbal_fingerprint_query',
      queryId: 'q1',
    });
    const state = getLastEvent(ctx, 'verbal_fingerprint_state');
    expect(state.queryId).toBe('q1');
    expect(state.rollingAccuracy).toBe(1);
    expect(state.totalRecords).toBe(1);
  });
});
