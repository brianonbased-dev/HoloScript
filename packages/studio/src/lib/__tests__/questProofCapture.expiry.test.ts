/**
 * Capture tokens carry an expiry inside the MAC (#607 follow-up b).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintQuestProofToken, verifyQuestProofToken } from '../questProofCapture';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const H = 60 * 60 * 1000;

beforeEach(() => vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', 'test-capture-secret'));
afterEach(() => vi.unstubAllEnvs());

describe('quest-proof capture token expiry', () => {
  it('is valid before exp and refused after', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    expect(verifyQuestProofToken('run-1', t, NOW + 1 * H)).toBe(true);
    expect(verifyQuestProofToken('run-1', t, NOW + 5 * H)).toBe(false);
  });

  it('defaults to a short lifetime (4 h)', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    expect(Number(t.split('.')[0]) - NOW / 1000).toBe(4 * 3600);
  });

  it('refuses a tampered exp', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    const [exp, mac] = t.split('.');
    expect(verifyQuestProofToken('run-1', `${Number(exp) + 3600}.${mac}`, NOW)).toBe(false);
  });

  it('clamps ttl to 24 h and refuses an exp further out than that', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW, ttlSeconds: 7 * 24 * 3600 })!;
    expect(Number(t.split('.')[0]) - NOW / 1000).toBe(24 * 3600);
    // A token whose exp is valid now but more than 24 h ahead of the verifier's clock.
    expect(verifyQuestProofToken('run-1', t, NOW - 2 * H)).toBe(false);
  });

  it('refuses old no-expiry (v1) tokens', async () => {
    const { createHmac } = await import('node:crypto');
    const v1 = createHmac('sha256', 'test-capture-secret')
      .update('quest-proof-capture:v1:run-1')
      .digest('base64url');
    expect(verifyQuestProofToken('run-1', v1, NOW)).toBe(false);
  });

  it('is bound to its runId', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    expect(verifyQuestProofToken('run-2', t, NOW)).toBe(false);
  });
});
