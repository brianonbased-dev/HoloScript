import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyTrackingHandler } from '@holoscript/core';
import { WebXRManager as RuntimeWebXRManager } from '../../runtime/WebXRManager';
import { WebXRManager as VrWebXRManager } from '../WebXRManager';

// Commit A: the Quest host caller. A mocked XRSession / XRFrame plays Quest Browser.
const META_JOINTS = ['head', 'neck', 'chest', 'spine-middle', 'spine-lower', 'hips', 'left-arm-upper', 'right-arm-upper', 'left-arm-lower', 'right-arm-lower', 'left-hand-wrist', 'right-hand-wrist', 'left-hand-palm', 'right-hand-palm', 'left-upper-leg', 'right-upper-leg', 'left-lower-leg', 'right-lower-leg', 'left-foot-ankle', 'right-foot-ankle', 'left-foot-ball', 'right-foot-ball'];

function mockXR(granted: boolean) {
  let endHandler: (() => void) | null = null;
  let rafCallback: ((t: number, f: unknown) => void) | null = null;
  const init: { value?: any } = {};
  const session: any = {
    enabledFeatures: granted ? ['local-floor', 'hand-tracking', 'body-tracking'] : ['local-floor', 'hand-tracking'],
    inputSources: [],
    addEventListener: vi.fn((type: string, cb: () => void) => { if (type === 'end') endHandler = cb; }),
    removeEventListener: vi.fn(),
    requestReferenceSpace: vi.fn(async (type: string) => ({ type })),
    requestAnimationFrame: vi.fn((cb: any) => { rafCallback = cb; return 1; }),
    updateRenderState: vi.fn(),
    end: vi.fn(async () => endHandler?.()),
  };
  vi.stubGlobal('navigator', {
    xr: {
      isSessionSupported: vi.fn(async () => true),
      requestSession: vi.fn(async (_mode: string, i: any) => { init.value = i; return session; }),
    },
  });
  const frame: any = {
    session,
    body: granted ? new Map(META_JOINTS.map((j) => [j, { joint: j }])) : undefined,
    getPose: vi.fn(() => ({ transform: { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } })),
    getHitTestResults: vi.fn(() => []),
  };
  return { session, frame, init, tick: () => rafCallback?.(16, frame) };
}

function bodyTrait() {
  const node: Record<string, any> = {};
  const emit = vi.fn();
  const config = { ...bodyTrackingHandler.defaultConfig, source: 'live_self', mode: 'full_body' } as any;
  bodyTrackingHandler.onAttach!(node as any, config, { emit } as any);
  const send = (e: any) => bodyTrackingHandler.onEvent!(node as any, config, { emit } as any, e);
  const names = () => emit.mock.calls.map((c) => c[0]);
  return { send, names, tracking: () => node.__bodyTrackingState.isTracking as boolean };
}

describe.each([
  ['runtime/WebXRManager', () => new RuntimeWebXRManager({ device: {}, format: 'bgra8unorm' } as any)],
  ['vr/WebXRManager', () => new VrWebXRManager()],
] as const)('%s: Quest body tracking as a local capture host', (_name, make) => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests body-tracking as optional only (works without it)', async () => {
    const xr = mockXR(false);
    await make().requestSession();
    expect(xr.init.value.optionalFeatures).toContain('body-tracking');
    expect(xr.init.value.requiredFeatures ?? []).not.toContain('body-tracking');
  });

  it('granted: frames feed stamped events, tracking applied, no generic fallback', async () => {
    const xr = mockXR(true);
    const m: any = make();
    const t = bodyTrait();
    const seen: any[] = [];
    m.onLocalTrackingEvent = (e: any) => { seen.push(e); t.send(e); };
    await m.requestSession();
    expect(m.getLocalTracking()).toEqual({ body: true, face: false });
    m.setAnimationLoop(() => {});
    xr.tick();
    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('body_pose_update');
    expect(t.tracking()).toBe(true);
    expect(t.names()).not.toContain('avatar_generic_fallback');

    // The same data arriving over the network (a peer's copy) is refused.
    const peer = bodyTrait();
    peer.send(JSON.parse(JSON.stringify(seen[0])));
    expect(peer.tracking()).toBe(false);
    expect(peer.names()).toContain('avatar_generic_fallback');

    // After the session ends, a stored copy of a live event is refused.
    await xr.session.end();
    expect(m.getLocalTracking()).toEqual({ body: false, face: false });
    const after = bodyTrait();
    after.send(seen[0]);
    expect(after.tracking()).toBe(false);
    expect(after.names()).toContain('avatar_generic_fallback');
  });

  it('not granted: no capture session, nothing stamped, live_self shows the generic fallback', async () => {
    const xr = mockXR(false);
    const m: any = make();
    const t = bodyTrait();
    const seen: any[] = [];
    m.onLocalTrackingEvent = (e: any) => seen.push(e);
    await m.requestSession();
    expect(m.getLocalTracking()).toEqual({ body: false, face: false });
    m.setAnimationLoop(() => {});
    xr.tick();
    expect(seen).toHaveLength(0);
    t.send({ type: 'body_pose_update', joints: { head: { position: [0, 1.6, 0], rotation: { x: 0, y: 0, z: 0, w: 1 }, confidence: 1 } } });
    expect(t.tracking()).toBe(false);
    expect(t.names()).toContain('avatar_generic_fallback');
  });
});
