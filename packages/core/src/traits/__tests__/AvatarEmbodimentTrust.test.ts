import { describe, expect, it, vi } from 'vitest';
import { avatarEmbodimentHandler, avatarRenderAllowed } from '../AvatarEmbodimentTrait';
import { startLocalCaptureSession } from '../LocalCapture';
import { grantLikenessShare } from '../LikenessShareGrant';
import { validateCanonicalSource } from '../../validation/CanonicalSourceValidator';

// Trust rulings on avatar_embodiment: gate on whose likeness the avatar carries; runtime default
// 'unknown' gated like the checker; declared live without a verified handle is self-preview only.
const GRANT = 'grant_ava';
function embody(tracking_source: unknown, opts: { likeness?: boolean; granted?: boolean; capture?: unknown } = {}) {
  const node: Record<string, any> = { traits: new Map<string, unknown>([['avatar_embodiment', {}]]) };
  if (opts.likeness) node.traits.set('face_mesh', {});
  if (opts.granted !== undefined) node.__consentGateState = { status: opts.granted ? 'granted' : 'pending' };
  const emit = vi.fn();
  const config = { ...avatarEmbodimentHandler.defaultConfig, ...(tracking_source === undefined ? {} : { tracking_source }) } as any;
  avatarEmbodimentHandler.onAttach!(node as any, config, { emit } as any);
  avatarEmbodimentHandler.onEvent!(node as any, config, { emit } as any, { type: 'embody', capture: opts.capture } as any);
  return { node, names: emit.mock.calls.map((c) => c[0]), embodied: node.__avatarEmbodimentState.isEmbodied as boolean };
}

describe('AvatarEmbodiment runtime (Trust)', () => {
  it.each(['playback', 'remote'])('%s: refused without granted consent, applies (shared) with it', (ts) => {
    const no = embody(ts);
    expect(no.embodied).toBe(false);
    expect(no.names).toContain('avatar_generic_fallback');
    const yes = embody(ts, { granted: true });
    expect(yes.embodied).toBe(true);
    expect(avatarRenderAllowed(yes.node, true)).toBe(true);
  });

  it('default source is unknown: renders on a synthetic avatar, fails closed on a real-likeness one', () => {
    expect(embody(undefined).embodied).toBe(true);
    const real = embody(undefined, { likeness: true });
    expect(real.embodied).toBe(false);
    expect(real.names).toContain('avatar_generic_fallback');
    expect(embody(undefined, { likeness: true, granted: true }).embodied).toBe(true);
  });

  it.each(['headset', 'camera'])('declared live (%s) without a verified handle: self-preview only, never shown to others', (ts) => {
    for (const capture of [undefined, { kind: 'body', deviceLabel: 'forged' }]) {
      const { node, names } = embody(ts, { capture, likeness: true });
      expect(node.__avatarEmbodimentState.visibility).toBe('self_preview');
      expect(names).toContain('avatar_visibility_restricted');
      expect(avatarRenderAllowed(node, false)).toBe(true);
      expect(avatarRenderAllowed(node, true)).toBe(false);
    }
  });

  it('B1: verified live capture is self-preview only; shown to others needs the self share grant', () => {
    const session = startLocalCaptureSession('body', 'quest');
    const { node, names } = embody('headset', { capture: session.handle, likeness: true });
    expect(node.__avatarEmbodimentState.visibility).toBe('self_preview');
    expect(node.__avatarEmbodimentState.liveVerified).toBe(true);
    expect(names).not.toContain('avatar_visibility_restricted');
    expect(avatarRenderAllowed(node, false)).toBe(true);
    expect(avatarRenderAllowed(node, true)).toBe(false);
    const scope = { sessionId: 's1', audience: ['bob'] };
    expect(avatarRenderAllowed(node, true, scope)).toBe(false);
    // face_mesh present: share grant + render_likeness yes + @consent_gate granted are all needed.
    (node as any).__trackedPersonId = 'ava';
    expect(grantLikenessShare(node, { grantorId: 'ava', trackedPersonId: 'ava', sessionId: 's1', audience: ['bob'], renderLikenessYes: true })).toBe(true);
    expect(avatarRenderAllowed(node, true, scope)).toBe(false);
    node.__consentGateState = { status: 'granted' };
    expect(avatarRenderAllowed(node, true, scope)).toBe(true);
    session.end();
  });

  it('synthetic AI avatar (no live, no likeness) still replicates without a grant', () => {
    const { node } = embody('ai');
    expect(avatarRenderAllowed(node, true)).toBe(true);
  });
});

describe('parity: checker and runtime agree across source x likeness', () => {
  const sources: Array<string | undefined> = [undefined, 'unknown', 'ai', 'scripted', 'headset', 'camera', 'playback', 'remote'];
  const cases = sources.flatMap((s) => [false, true].map((likeness) => [s, likeness] as const));
  it.each(cases)('tracking_source %s, real likeness %s', (source, likeness) => {
    const ts = source === undefined ? '' : `(tracking_source: "${source}")`;
    const body = (claim: boolean) =>
      `object "Ava" {\n${claim ? `  @consent_gate(grant: "${GRANT}")\n` : ''}${likeness ? '  @face_mesh\n' : ''}  @avatar_embodiment${ts}\n}\n`;
    const embodimentErrors = (src: string, rules?: Record<string, string[]>) =>
      validateCanonicalSource({ source: src, surface: 'holo', consentRules: rules }).errors.filter(
        (e) => e.code === 'HS1011' && /avatar_embodiment/.test(e.message)
      ).length;
    // Without a grant: the checker refuses iff the runtime refuses.
    const checkerRefuses = embodimentErrors(body(false)) > 0;
    const runtimeRefuses = !embody(source, { likeness }).embodied;
    expect(runtimeRefuses).toBe(checkerRefuses);
    // With a grant (rule yes / runtime consent granted): both accept.
    expect(embodimentErrors(body(true), { [GRANT]: ['face', 'body'] })).toBe(0);
    expect(embody(source, { likeness, granted: true }).embodied).toBe(true);
  });
});
