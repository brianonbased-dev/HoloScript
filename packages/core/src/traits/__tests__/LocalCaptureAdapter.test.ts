import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { faceTrackingHandler } from '../FaceTrackingTrait';
import { bodyTrackingHandler } from '../BodyTrackingTrait';
import { startLocalCaptureSession, LOCAL_CAPTURE_EVENT } from '../LocalCapture';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { HoloScriptPlusParser } from '../../parser/HoloScriptPlusParser';

// Host capture adapter: the code that opens a local face/body device starts a session, stamps
// every event with its handle and ends it with the device. The tests play that host (no real
// device exists in CI). Network / replay paths carry no handle and are refused under live_self.
const POSE = { position: [0, 1.7, 0], rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 1 };
const ALL_JOINTS = ['head', 'neck', 'spine_chest', 'spine_mid', 'spine_base', 'hips', 'shoulder_left', 'shoulder_right', 'elbow_left', 'elbow_right', 'wrist_left', 'wrist_right', 'hand_left', 'hand_right', 'hip_left', 'hip_right', 'knee_left', 'knee_right', 'ankle_left', 'ankle_right', 'foot_left', 'foot_right'];
const DATA = {
  face: { blendShapes: { jawOpen: 0.5, mouthSmileLeft: 0.2 } },
  body: { joints: Object.fromEntries(ALL_JOINTS.map((j) => [j, POSE])) },
} as const;
const HANDLER = { face: faceTrackingHandler, body: bodyTrackingHandler } as any;
const STATE = { face: '__faceTrackingState', body: '__bodyTrackingState' } as const;

function attach(kind: 'face' | 'body', declared: Record<string, unknown>) {
  const handler = HANDLER[kind];
  const node: Record<string, any> = {};
  const emit = vi.fn();
  const config = { ...handler.defaultConfig, ...declared };
  handler.onAttach(node, config, { emit });
  const send = (e: Record<string, unknown>) => handler.onEvent(node, config, { emit }, e);
  const names = () => emit.mock.calls.map((c: unknown[]) => c[0]);
  return { node, send, names, tracking: () => node[STATE[kind]].isTracking as boolean };
}

describe.each(['face', 'body'] as const)('host capture adapter (%s)', (kind) => {
  it('a local session: events apply under live_self, no generic fallback; refused after end()', () => {
    const t = attach(kind, { source: 'live_self', mode: 'full_body' });
    const session = startLocalCaptureSession(kind, 'test device');
    const e = session.event(DATA[kind]);
    expect(e.type).toBe(LOCAL_CAPTURE_EVENT[kind]);
    t.send(e);
    expect(t.tracking()).toBe(true);
    expect(t.names()).not.toContain('avatar_generic_fallback');
    session.end();
    t.send(e); // a stored copy of a live event, replayed after the device closed
    expect(t.names()).toContain('avatar_generic_fallback');
    expect(() => session.event(DATA[kind])).toThrow();
  });

  it('a network or replay path fed the same data is refused under live_self', () => {
    const t = attach(kind, { source: 'live_self', mode: 'full_body' });
    const live = startLocalCaptureSession(kind).event(DATA[kind]);
    const network = JSON.parse(JSON.stringify(live)); // what a peer or a recording delivers
    t.send(network);
    t.send({ ...DATA[kind], type: LOCAL_CAPTURE_EVENT[kind] });
    expect(t.tracking()).toBe(false);
    expect(t.names()).toContain('avatar_generic_fallback');
  });
});

// The three repo examples, as far as the runtime can run in a test: the declared trait config
// is read from the parsed file, then fed by a local capture session.
const EX = path.resolve(__dirname, '../../../../../examples');
function declaredTraits(ast: unknown, name: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (String(n.name ?? '').replace(/^@/, '') === name && (n.type === 'ObjectTrait' || n.type === 'Trait' || 'config' in n))
      out.push((n.config ?? n.args ?? {}) as Record<string, unknown>);
    Object.values(n).forEach(walk);
  };
  walk(ast);
  return out;
}
const holo = (f: string) => new HoloCompositionParser().parse(readFileSync(path.join(EX, f), 'utf8')).ast;
const hsplus = (f: string) => new HoloScriptPlusParser().parse(readFileSync(path.join(EX, f), 'utf8')).ast;

describe.each([
  ['ar-foundation/face-tracking.holo', holo, 'face_tracking', 'face'],
  ['avatars/readyplayerme-avatar.holo', holo, 'body_tracking', 'body'],
  ['xr/xr-platform-showcase.hsplus', hsplus, 'body_tracking', 'body'],
  ['xr/xr-platform-showcase.hsplus', hsplus, 'face_tracking', 'face'],
] as const)('example %s @%s end to end', (file, parse, trait, kind) => {
  it('declares live_self and shows tracking applied from a local session, not the fallback', () => {
    const configs = declaredTraits(parse(file), trait);
    expect(configs.length).toBeGreaterThan(0);
    for (const declared of configs) {
      expect(declared.source).toBe('live_self');
      const t = attach(kind, { ...declared, mode: 'full_body' });
      const session = startLocalCaptureSession(kind, file);
      t.send(session.event(DATA[kind]));
      expect(t.tracking()).toBe(true);
      expect(t.names()).not.toContain('avatar_generic_fallback');
      session.end();
    }
  });
});
