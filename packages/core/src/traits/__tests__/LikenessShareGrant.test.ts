import { describe, expect, it, vi } from 'vitest';
import { grantLikenessShare, likenessShareAllowed, revokeLikenessShare } from '../LikenessShareGrant';
import { avatarRenderAllowed } from '../AvatarEmbodimentTrait';

// Trust POLICY.md §3 + Release: explicit, self-granted, session- and audience-scoped, revocable.
const req = (o: Record<string, unknown> = {}) =>
  ({ grantorId: 'ava', trackedPersonId: 'ava', sessionId: 's1', audience: ['bob', 'cy'], renderLikenessYes: true, ...o }) as any;
const tracked = () => ({ traits: new Map([['body_tracking', { source: 'live_self' }]]) }) as Record<string, any>;

describe('likeness share grant', () => {
  it('no grant by default (joining is not consent)', () => {
    const n = tracked();
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: ['bob'] })).toBe(false);
    expect(avatarRenderAllowed(n, true, { sessionId: 's1', audience: ['bob'] })).toBe(false);
  });
  it('grantor must be the tracked person', () => {
    const n = tracked();
    expect(grantLikenessShare(n, req({ grantorId: 'host' }))).toBe(false);
    n.__trackedPersonId = 'zoe';
    expect(grantLikenessShare(n, req())).toBe(false);
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: ['bob'] })).toBe(false);
  });
  it('needs the render_likeness yes and a non-empty audience', () => {
    expect(grantLikenessShare(tracked(), req({ renderLikenessYes: false }))).toBe(false);
    expect(grantLikenessShare(tracked(), req({ audience: [] }))).toBe(false);
  });
  it('scope: session mismatch is refused', () => {
    const n = tracked();
    expect(grantLikenessShare(n, req())).toBe(true);
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: ['bob'] })).toBe(true);
    expect(likenessShareAllowed(n, { sessionId: 's2', audience: ['bob'] })).toBe(false);
    expect(likenessShareAllowed(n, undefined)).toBe(false);
  });
  it('audience mismatch: any viewer outside the granted audience refuses the frame', () => {
    const n = tracked();
    grantLikenessShare(n, req());
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: ['bob', 'cy'] })).toBe(true);
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: ['bob', 'eve'] })).toBe(false);
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: [] })).toBe(false);
  });
  it('revoke: refused from the next check', () => {
    const n = tracked();
    grantLikenessShare(n, req());
    revokeLikenessShare(n);
    expect(likenessShareAllowed(n, { sessionId: 's1', audience: ['bob'] })).toBe(false);
  });
  it('N1: tracking state without avatar_embodiment is gated', () => {
    for (const k of ['__faceTrackingState', '__bodyTrackingState']) {
      const n: Record<string, any> = { [k]: {} };
      expect(avatarRenderAllowed(n, true)).toBe(false);
      grantLikenessShare(n, req());
      expect(avatarRenderAllowed(n, true, { sessionId: 's1', audience: ['bob'] })).toBe(true);
    }
    for (const t of ['face_tracking', 'body_tracking', 'lip_sync', 'voice_print', 'body_scan', 'face_mesh', 'avatar_embodiment']) {
      expect(avatarRenderAllowed({ traits: [t] }, true)).toBe(false);
    }
  });
});
