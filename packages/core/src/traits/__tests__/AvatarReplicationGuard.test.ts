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
});
