import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard (Trust hard requirement): code that replicates or broadcasts avatar / embodiment state to
 * other people must call avatarRenderAllowed(node, shownToOthers).
 *
 * Narrow and lexical by design: a non-test source file under packages/ that both (a) touches a
 * network or broadcast path (WebRTCTransport, .broadcast(, transport.send(, sendToPeer, or an
 * emit marked 'network layer') and (b) handles avatar / embodiment STATE (__avatarState,
 * __avatarEmbodimentState, avatar_pose_update, AvatarEmbodiment) must mention avatarRenderAllowed.
 * Limits: it cannot follow data across files or dynamic dispatch, it doesn't prove the call is on
 * every branch, and it doesn't see code outside this repo (Hololand, native apps).
 */
const ROOT = path.resolve(__dirname, '../../../../..');
const NETWORK = /WebRTCTransport|\.broadcast\(|transport\.send\(|sendToPeer|network layer/i;
// N1: any likeness or tracking source, not only avatar_embodiment.
const AVATAR_STATE =
  /__avatarState|__avatarEmbodimentState|avatar_pose_update|AvatarEmbodiment|__faceTrackingState|__bodyTrackingState|__lip_sync_instance|face_tracking_update|body_tracking_update|blendshape|face_mesh|voice_print|body_scan/;
/**
 * Release B1: live pose / face / voice / body events that drive the user's OWN self-preview.
 * They are local-only: no network file may touch them without the share-grant gate.
 */
const LOCAL_LIVE_EVENTS = [
  'local_avatar_pose', 'avatar_blend_shapes', 'avatar_eye_gaze', 'avatar_head_pose',
  'lip_sync_phoneme', 'face_expression_update', 'body_pose_changed', 'body_pose_update',
  'face_data_update', 'local_voice_stream_ready',
];
const LOCAL_LIVE = new RegExp(`['"\`](${LOCAL_LIVE_EVENTS.join('|')})['"\`]`);
/** The network-bound live pose event. Every emitter of it must be share-grant gated. */
const NETWORK_POSE_EMIT = /emit\??\.?\(\s*['"`]avatar_pose_update['"`]/;
const GATED = (src: string) => src.includes('avatarRenderAllowed('); // which itself requires the LikenessShareGrant grant
/** Files that match lexically but carry no avatar state; reason required. */
const ALLOW: Record<string, string> = {
  'packages/core/scripts/generate-types.mjs': 'type declarations only (it declares avatarRenderAllowed)',
};

describe('avatar replication guard', () => {
  it('every replicating file calls avatarRenderAllowed', () => {
    const files = execSync("git ls-files 'packages/*.ts' 'packages/*.js' 'packages/*.mjs'", { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !/(__tests__|\.test\.|\.spec\.|\/dist\/|\/node_modules\/)/.test(f));
    const offenders: string[] = [];
    let replicating = 0;
    for (const f of files) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      if (!NETWORK.test(src) || !AVATAR_STATE.test(src)) continue;
      replicating++;
      if (!src.includes('avatarRenderAllowed(') && !(f in ALLOW)) offenders.push(f);
    }
    expect(offenders, 'replicate avatar state without avatarRenderAllowed').toEqual([]);
    expect(replicating).toBeGreaterThanOrEqual(2); // NetworkedAvatarTrait (core + engine)
  });

  it('the guard bites: a replicating file without the call is flagged', () => {
    const src = "transport.send(peer, { pose: node.__avatarState.pose });";
    expect(NETWORK.test(src) && AVATAR_STATE.test(src) && !src.includes('avatarRenderAllowed(')).toBe(true);
  });

  it.each([
    'transport.send(peer, node.__bodyTrackingState.joints);',
    'sendToPeer(id, { face: node.__faceTrackingState.blendshapes });',
    'room.broadcast({ visemes: node.__lip_sync_instance.current });',
  ])('N1: tracking state without avatar_embodiment is caught: %s', (src) => {
    expect(NETWORK.test(src) && AVATAR_STATE.test(src) && !src.includes('avatarRenderAllowed(')).toBe(true);
  });

  const sources = () =>
    execSync("git ls-files 'packages/*.ts' 'packages/*.js' 'packages/*.mjs'", { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && !/(__tests__|\.test\.|\.spec\.|\/dist\/|\/node_modules\/)/.test(f))
      .map((f) => ({ f, src: readFileSync(path.join(ROOT, f), 'utf8') }));

  it('B1: every emitter of the network pose event (avatar_pose_update) is share-grant gated', () => {
    const emitters = sources().filter(({ src }) => NETWORK_POSE_EMIT.test(src));
    expect(emitters.map((e) => e.f).sort()).toEqual([
      'packages/core/src/traits/NetworkedAvatarTrait.ts',
      'packages/engine/src/traits/NetworkedAvatarTrait.ts',
    ]);
    expect(emitters.filter(({ src }) => !GATED(src)).map((e) => e.f)).toEqual([]);
  });

  it('B1: live self-preview events stay local (no network file touches them ungated)', () => {
    const leaks = sources()
      .filter(({ f, src }) => NETWORK.test(src) && LOCAL_LIVE.test(src) && !GATED(src) && !(f in ALLOW))
      .map((e) => e.f);
    expect(leaks).toEqual([]);
  });

  it.each([
    "context.emit?.('avatar_pose_update', { node, joints });",
    "ctx.emit('avatar_pose_update', { pose });",
  ])('B1 bite: an ungated emitter of the network pose event is caught: %s', (src) => {
    expect(NETWORK_POSE_EMIT.test(src) && !GATED(src)).toBe(true);
  });

  it.each([
    "bus.on('local_avatar_pose', (e) => transport.send(peer, e));",
    "on('avatar_blend_shapes', (e) => room.broadcast(e));",
    "on('lip_sync_phoneme', (e) => sendToPeer(id, e));",
    "on('local_voice_stream_ready', (e) => sendToPeer(id, e.stream));",
  ])('B1 bite: a network relay of a local live event is caught: %s', (src) => {
    expect(NETWORK.test(src) && LOCAL_LIVE.test(src) && !GATED(src)).toBe(true);
  });
});
