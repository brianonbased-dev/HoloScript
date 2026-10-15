import { describe, expect, it, vi } from 'vitest';
import { faceTrackingHandler } from '../FaceTrackingTrait';
import { bodyTrackingHandler } from '../BodyTrackingTrait';
import { closeLocalCapture, isLocalCapture, openLocalCapture } from '../LocalCapture';

// Trust and Consent POLICY s3, condition 3: live_self is verified at runtime against a local
// capture the runtime opened itself, not trusted from the declared value.
const setup = (handler: any, source?: string) => {
  const node: Record<string, unknown> = {};
  const emit = vi.fn();
  const config = { ...handler.defaultConfig, ...(source ? { source } : {}) };
  handler.onAttach(node, config, { emit });
  return { node, emit, config, send: (e: any) => handler.onEvent(node, config, { emit }, e) };
};
const POSE = { position: [0, 1.7, 0], rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 1 };
const JOINTS = Object.fromEntries(
  ['head', 'neck', 'spine_chest', 'spine_mid', 'shoulder_left', 'shoulder_right', 'elbow_left', 'elbow_right', 'wrist_left', 'wrist_right', 'hand_left', 'hand_right'].map((j) => [j, POSE])
);
const events = (emit: any) => emit.mock.calls.map((c: any[]) => c[0]);

describe('LocalCapture handles', () => {
  it('only an open handle of the right kind verifies; copies and data do not', () => {
    const h = openLocalCapture('face', 'front camera');
    expect(isLocalCapture(h, 'face')).toBe(true);
    expect(isLocalCapture(h, 'body')).toBe(false);
    expect(isLocalCapture({ ...h }, 'face')).toBe(false);
    expect(isLocalCapture(JSON.parse(JSON.stringify(h)), 'face')).toBe(false);
    closeLocalCapture(h);
    expect(isLocalCapture(h, 'face')).toBe(false);
  });
});

describe.each([
  ['face_tracking', faceTrackingHandler, 'face', { type: 'face_data_update', blendShapes: { jawOpen: 0.5 } }, 'face_expression_update'],
  ['body_tracking', bodyTrackingHandler, 'body', { type: 'body_pose_update', joints: JOINTS }, 'body_pose_changed'],
] as const)('%s runtime: live_self needs a local capture', (_n, handler, kind, event, applied) => {
  it('declared live_self, no capture handle: refused, generic avatar fallback', () => {
    const t = setup(handler, 'live_self');
    t.send({ ...event });
    expect(events(t.emit)).toContain('avatar_generic_fallback');
    expect(events(t.emit)).not.toContain(applied);
  });
  it('declared live_self, forged / replayed / wrong-kind handle: refused', () => {
    const t = setup(handler, 'live_self');
    const real = openLocalCapture(kind);
    t.send({ ...event, capture: { ...real } });
    t.send({ ...event, capture: openLocalCapture(kind === 'face' ? 'body' : 'face') });
    expect(events(t.emit)).not.toContain(applied);
    expect(events(t.emit).filter((e: string) => e === 'avatar_generic_fallback')).toHaveLength(1);
  });
  it('declared live_self, from a local capture the runtime opened: applied', () => {
    const t = setup(handler, 'live_self');
    const h = openLocalCapture(kind, 'device');
    t.send({ ...event, capture: h });
    expect(events(t.emit)).not.toContain('avatar_generic_fallback');
    expect((t.node as any)[kind === 'face' ? '__faceTrackingState' : '__bodyTrackingState'].isTracking).toBe(true);
    closeLocalCapture(h);
    t.send({ ...event, capture: h });
    expect(events(t.emit)).toContain('avatar_generic_fallback');
  });
  it('unknown declared source is refused at runtime too', () => {
    const t = setup(handler, 'webcam');
    t.send({ ...event });
    expect(events(t.emit)).toContain('avatar_generic_fallback');
  });
});
