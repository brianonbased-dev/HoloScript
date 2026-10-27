import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

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
  'local_avatar_pose',
  'avatar_blend_shapes',
  'avatar_eye_gaze',
  'avatar_head_pose',
  'lip_sync_phoneme',
  'face_expression_update',
  'body_pose_changed',
  'body_pose_update',
  'face_data_update',
  'local_voice_stream_ready',
];
const LOCAL_LIVE = new RegExp(`['"\`](${LOCAL_LIVE_EVENTS.join('|')})['"\`]`);
/** The network-bound live pose event. Every emitter of it must be share-grant gated. */
const NETWORK_POSE_EMIT = /emit\??\.?\(\s*['"`]avatar_pose_update['"`]/;
const GATED = (src: string) => src.includes('avatarRenderAllowed('); // which itself requires the LikenessShareGrant grant
/** Files that match lexically but carry no avatar state; reason required. */
const ALLOW: Record<string, string> = {
  'packages/core/scripts/generate-types.mjs':
    'type declarations only (it declares avatarRenderAllowed)',
};

/**
 * Tracked non-test sources under packages/. execFileSync with no shell, so the pathspecs reach git
 * verbatim on every OS (single-quoted globs through a Windows shell matched 0 files). Fails loudly
 * if nothing matches, so the guard can never pass vacuously.
 */
function listSourceFiles(): string[] {
  // --others --exclude-standard: a new, not-yet-added file is guarded too (and the planted
  // violation below goes through this exact path).
  const out = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      'packages/*.ts',
      'packages/*.js',
      'packages/*.mjs',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }
  );
  const files = out
    .split(/\r?\n/)
    .filter(
      (f) =>
        f &&
        !/(__tests__|\.test\.|\.spec\.|\/dist\/|\/node_modules\/|\/\.next\/|\/\.bench-logs\/)/.test(
          f
        )
    );
  if (files.length < 100) {
    throw new Error(
      `AvatarReplicationGuard: git ls-files matched ${files.length} source files under ${ROOT}; the guard would pass vacuously`
    );
  }
  return [...new Set(files)];
}

type Source = { f: string; src: string };
/** One read per file per run: each test used to rescan and reread everything (16-70 s each under load). */
const sourceCache = new Map<string, string>();
const readSources = (files: string[]): Source[] =>
  files.map((f) => {
    let src = sourceCache.get(f);
    if (src === undefined) {
      src = readFileSync(path.join(ROOT, f), 'utf8');
      sourceCache.set(f, src);
    }
    return { f, src };
  });
/** Replicating files (network + avatar/tracking state) that skip avatarRenderAllowed. */
const replicationOffenders = (sources: Source[]) =>
  sources
    .filter(
      ({ f, src }) => NETWORK.test(src) && AVATAR_STATE.test(src) && !GATED(src) && !(f in ALLOW)
    )
    .map((e) => e.f);
/** Emitters of the network pose event that skip the gate. */
const poseEmitOffenders = (sources: Source[]) =>
  sources.filter(({ src }) => NETWORK_POSE_EMIT.test(src) && !GATED(src)).map((e) => e.f);
/** Network files that touch a local live event ungated. */
const localLeakOffenders = (sources: Source[]) =>
  sources
    .filter(
      ({ f, src }) => NETWORK.test(src) && LOCAL_LIVE.test(src) && !GATED(src) && !(f in ALLOW)
    )
    .map((e) => e.f);

describe('avatar replication guard', () => {
  // One scoped scan in beforeAll, shared by every test below.
  let scanned: Source[] = [];
  beforeAll(() => {
    scanned = readSources(listSourceFiles());
  }, 120_000);
  const sources = () => scanned;

  it('every replicating file calls avatarRenderAllowed', () => {
    const offenders: string[] = [];
    let replicating = 0;
    for (const { f, src } of sources()) {
      if (!NETWORK.test(src) || !AVATAR_STATE.test(src)) continue;
      replicating++;
      if (!src.includes('avatarRenderAllowed(') && !(f in ALLOW)) offenders.push(f);
    }
    expect(offenders, 'replicate avatar state without avatarRenderAllowed').toEqual([]);
    expect(replicating).toBeGreaterThanOrEqual(2); // NetworkedAvatarTrait (core + engine)
  });

  it('the guard bites: a replicating file without the call is flagged', () => {
    const src = 'transport.send(peer, { pose: node.__avatarState.pose });';
    expect(
      NETWORK.test(src) && AVATAR_STATE.test(src) && !src.includes('avatarRenderAllowed(')
    ).toBe(true);
  });

  it.each([
    'transport.send(peer, node.__bodyTrackingState.joints);',
    'sendToPeer(id, { face: node.__faceTrackingState.blendshapes });',
    'room.broadcast({ visemes: node.__lip_sync_instance.current });',
  ])('N1: tracking state without avatar_embodiment is caught: %s', (src) => {
    expect(
      NETWORK.test(src) && AVATAR_STATE.test(src) && !src.includes('avatarRenderAllowed(')
    ).toBe(true);
  });

  it('B1: every emitter of the network pose event (avatar_pose_update) is share-grant gated', () => {
    const emitters = sources().filter(({ src }) => NETWORK_POSE_EMIT.test(src));
    expect(emitters.map((e) => e.f).sort()).toEqual([
      'packages/core/src/traits/NetworkedAvatarTrait.ts',
      'packages/engine/src/traits/NetworkedAvatarTrait.ts',
    ]);
    expect(poseEmitOffenders(emitters)).toEqual([]);
  });

  it('B1: live self-preview events stay local (no network file touches them ungated)', () => {
    expect(localLeakOffenders(sources())).toEqual([]);
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

  it('lists sources without a shell and never vacuously', () => {
    const files = sources().map((s) => s.f);
    expect(files).toContain('packages/core/src/traits/NetworkedAvatarTrait.ts');
    expect(files).toContain('packages/engine/src/traits/NetworkedAvatarTrait.ts');
    expect(files.some((f) => f.includes('__tests__'))).toBe(false);
  });

  it('BodyTrackingTrait emits live joints only as local_avatar_pose', () => {
    const src = readFileSync(
      path.join(ROOT, 'packages/core/src/traits/BodyTrackingTrait.ts'),
      'utf8'
    );
    expect(src).toMatch(/emit\??\.?\(\s*'local_avatar_pose'/);
    expect(NETWORK_POSE_EMIT.test(src)).toBe(false);
  });

  it('a planted violation on disk is flagged through the same listing path (CoS)', () => {
    const rel = `packages/core/src/traits/zz-guard-plant-${process.pid}.ts`;
    const abs = path.join(ROOT, rel);
    writeFileSync(
      abs,
      'export const planted = (context: any, node: any) => {\n' +
        '  // Emit event to network layer\n' +
        "  context.emit('avatar_pose_update', { node, pose: node.__avatarState.pose });\n" +
        '  transport.send(peer, node.__bodyTrackingState.joints);\n' +
        "  bus.on('local_avatar_pose', (e: any) => sendToPeer(id, e));\n" +
        '};\n'
    );
    try {
      const files = listSourceFiles();
      expect(files).toContain(rel);
      const planted = readSources(files);
      expect(replicationOffenders(planted)).toEqual([rel]);
      expect(poseEmitOffenders(planted)).toEqual([rel]);
      expect(localLeakOffenders(planted)).toEqual([rel]);
    } finally {
      rmSync(abs, { force: true });
    }
    expect(listSourceFiles()).not.toContain(rel);
  });
});
