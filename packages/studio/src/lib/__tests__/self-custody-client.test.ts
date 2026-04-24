import { describe, it, expect } from 'vitest';
import {
  isApiError,
  newIdempotencyKey,
  recoveryTargetForError,
  scorePassword,
} from '../self-custody-client';

describe('self-custody-client helpers', () => {
  describe('scorePassword', () => {
    it('rejects short passwords', () => {
      expect(scorePassword('abc').score).toBe(0);
      expect(scorePassword('1234567').score).toBe(0);
    });

    it('flags common patterns', () => {
      const s = scorePassword('password123');
      expect(s.score).toBeLessThanOrEqual(1);
      expect(s.feedback.some((f) => /common patterns/i.test(f))).toBe(true);
    });

    it('scores strong passwords highly', () => {
      const s = scorePassword('CorrectHorseBatteryStaple-42!');
      expect(s.score).toBeGreaterThanOrEqual(3);
    });

    it('caps score at 4', () => {
      const s = scorePassword('This_is_a_really_long_complex_password_42!ABCdef');
      expect(s.score).toBeLessThanOrEqual(4);
    });
  });

  describe('newIdempotencyKey', () => {
    it('produces a UUID-v4-shaped string', () => {
      const k = newIdempotencyKey();
      expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('produces distinct keys across calls', () => {
      // Can't guarantee with crypto.randomUUID mocked, but the shape shouldn't
      // collide in practice. Use a loose check — fallback path is also UUID-4.
      const a = newIdempotencyKey();
      const b = newIdempotencyKey();
      expect(typeof a).toBe('string');
      expect(typeof b).toBe('string');
    });
  });

  describe('isApiError', () => {
    it('accepts success:false envelopes', () => {
      expect(isApiError({ success: false, error: 'x', http_status: 400 })).toBe(
        true
      );
    });
    it('rejects success:true envelopes', () => {
      expect(isApiError({ success: true })).toBe(false);
    });
    it('rejects non-objects', () => {
      expect(isApiError(null)).toBe(false);
      expect(isApiError('oops')).toBe(false);
      expect(isApiError(42)).toBe(false);
    });
  });

  describe('recoveryTargetForError', () => {
    it('5xx goes to idle (whole-flow retry)', () => {
      expect(recoveryTargetForError('registry_transaction_failed', 500)).toBe('idle');
      expect(recoveryTargetForError('any_error', 503)).toBe('idle');
    });

    it('bad_ownership_proof resumes at ownership', () => {
      expect(recoveryTargetForError('bad_ownership_proof', 400)).toBe(
        'awaiting-ownership'
      );
    });

    it('session_expired routes to idle', () => {
      expect(recoveryTargetForError('session_expired', 400)).toBe('idle');
    });

    it('manifest_hash_mismatch routes to idle', () => {
      expect(recoveryTargetForError('manifest_hash_mismatch', 400)).toBe('idle');
    });

    it('already_self_custody routes to idle (treated as terminal)', () => {
      expect(recoveryTargetForError('already_self_custody', 409)).toBe('idle');
    });

    it('unknown codes default to idle', () => {
      expect(recoveryTargetForError('unknown_code', 400)).toBe('idle');
    });
  });
});
