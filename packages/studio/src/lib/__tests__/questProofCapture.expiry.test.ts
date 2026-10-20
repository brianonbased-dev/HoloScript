/**
 * Capture tokens carry an expiry inside the MAC (#607 follow-up b).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintQuestProofToken, verifyQuestProofToken } from '../questProofCapture';

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const H = 60 * 60 * 1000;

beforeEach(() => vi.stubEnv('NEXTAUTH_SECRET', 'test-nextauth-secret'));
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
    const v1 = createHmac('sha256', 'test-nextauth-secret')
      .update('quest-proof-capture:v1:run-1')
      .digest('base64url');
    expect(verifyQuestProofToken('run-1', v1, NOW)).toBe(false);
  });

  it('is bound to its runId', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    expect(verifyQuestProofToken('run-2', t, NOW)).toBe(false);
  });

  it('KEY: is keyed by HKDF(NEXTAUTH_SECRET, fixed salt, info quest-proof-capture-v1), never the raw secret', async () => {
    const { createHmac, hkdfSync } = await import('node:crypto');
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    const [exp, mac] = t.split('.');
    const msg = `quest-proof-capture:v2:run-1:${exp}`;
    const raw = createHmac('sha256', 'test-nextauth-secret').update(msg).digest('base64url');
    const key = Buffer.from(hkdfSync('sha256', 'test-nextauth-secret', 'holoscript/quest-proof-capture/salt/v1', 'quest-proof-capture-v1', 32));
    expect(mac).not.toBe(raw);
    expect(mac).toBe(createHmac('sha256', key).update(msg).digest('base64url'));
  });

  it('KEY: refuses when NEXTAUTH_SECRET is unset, and QUEST_PROOF_CAPTURE_SECRET is not a fallback', () => {
    const t = mintQuestProofToken('run-1', { nowMs: NOW })!;
    vi.stubEnv('NEXTAUTH_SECRET', '');
    vi.stubEnv('QUEST_PROOF_CAPTURE_SECRET', 'old-capture-secret');
    expect(mintQuestProofToken('run-1', { nowMs: NOW })).toBeNull();
    expect(verifyQuestProofToken('run-1', t, NOW)).toBe(false);
  });
});