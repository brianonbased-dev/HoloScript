/**
 * Tests for Layer 5: VR (WebXRSystem) and Networking (NetworkSystem)
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// WebXRSystem Tests
// ============================================================================

import { WebXRSystem } from '../../../../core/src/vr/WebXRSystem';
import type { XRFrameData } from '../../../../core/src/vr/WebXRSystem';

describe('WebXRSystem', () => {
  it('starts in inactive mode', () => {
    const xr = new WebXRSystem();
    expect(xr.getMode()).toBe('inactive');
  });

  it('enterVR switches to immersive-vr and fires sessionstart', () => {
    const xr = new WebXRSystem();
    const events: string[] = [];
    xr.on('sessionstart', () => events.push('start'));

    xr.enterVR();
    expect(xr.getMode()).toBe('immersive-vr');
    expect(events).toEqual(['start']);
  });

  it('exit fires sessionend and returns to inactive', () => {
    const xr = new WebXRSystem();
    const events: string[] = [];
    xr.on('sessionend', () => events.push('end'));

    xr.enterVR();
    xr.exit();
    expect(xr.getMode()).toBe('inactive');
    expect(events).toEqual(['end']);
  });

  it('submitFrame updates head position and stereo views', () => {
    const xr = new WebXRSystem();
    xr.enterVR();

    const frame: XRFrameData = {
      time: 0,
      headPosition: { x: 1, y: 1.7, z: 0 },
      headRotation: { x: 0, y: 0.5, z: 0 },
      views: [
        {
          eye: 'left',
          projectionMatrix: new Float32Array(16),
          viewMatrix: new Float32Array(16),
          viewport: { x: 0, y: 0, width: 1920, height: 1080 },
        },
        {
          eye: 'right',
          projectionMatrix: new Float32Array(16),
          viewMatrix: new Float32Array(16),
          viewport: { x: 1920, y: 0, width: 1920, height: 1080 },
        },
      ],
      controllers: new Map(),
      hands: new Map(),
    };

    xr.submitFrame(frame);
    expect(xr.getHeadPosition()).toEqual({ x: 1, y: 1.7, z: 0 });
    expect(xr.getLeftEye()).not.toBeNull();
    expect(xr.getRightEye()).not.toBeNull();
    expect(xr.getStereoViews().length).toBe(2);
  });

  it('controller tracking returns input state', () => {
    const xr = new WebXRSystem();
    xr.enterVR();

    const controllers = new Map();
    controllers.set('left-hand', {
      position: [-0.3, 1.0, -0.5],
      rotation: { x: 0, y: 0, z: 0 },
      trigger: 0.9,
      grip: 0.1,
      thumbstick: { x: 0, y: 0 },
      buttons: [],
    });

    xr.submitFrame({
      time: 0,
      headPosition: { x: 0, y: 1.7, z: 0 },
      headRotation: { x: 0, y: 0, z: 0 },
      views: [],
      controllers,
      hands: new Map(),
    });

    const ctrl = xr.getController('left-hand');
    expect(ctrl).toBeDefined();
    expect(ctrl!.trigger).toBe(0.9);
    expect(xr.getAllControllers().size).toBe(1);
  });

  it('smooth locomotion moves player via left thumbstick', () => {
    const xr = new WebXRSystem();
    xr.enterVR();
    xr.setLocomotionSpeed(5);

    const controllers = new Map();
    controllers.set('left-hand', {
      position: [0, 1, 0],
      rotation: { x: 0, y: 0, z: 0 },
      trigger: 0,
      grip: 0,
      thumbstick: { x: 0, y: -1 }, // Forward
      buttons: [],
    });

    xr.submitFrame({
      time: 0,
      headPosition: { x: 0, y: 1.7, z: 0 },
      headRotation: { x: 0, y: 0, z: 0 },
      views: [],
      controllers,
      hands: new Map(),
    });

    xr.update(1 / 60);
    const pos = xr.getPlayerPosition();
    expect(pos.z).toBeLessThan(0); // Moved forward (negative Z in standard coords)
  });

  it('teleportTo queues teleport for next frame', () => {
    const xr = new WebXRSystem();
    xr.enterVR();
    xr.submitFrame({
      time: 0,
      headPosition: { x: 0, y: 1.7, z: 0 },
      headRotation: { x: 0, y: 0, z: 0 },
      views: [],
      controllers: new Map(),
      hands: new Map(),
    });

    xr.teleportTo({ x: 10, y: 0, z: -5 });
    xr.update(1 / 60);
    expect(xr.getPlayerPosition()).toEqual({ x: 10, y: 0, z: -5 });
  });

  it('grab callback fires when grip > 0.8', () => {
    const xr = new WebXRSystem();
    xr.enterVR();

    const grabs: string[] = [];
    xr.onGrab((id) => grabs.push(id));

    const controllers = new Map();
    controllers.set('right-hand', {
      position: [0.3, 1, -0.3],
      rotation: { x: 0, y: 0, z: 0 },
      trigger: 0,
      grip: 0.9, // Gripping!
      thumbstick: { x: 0, y: 0 },
      buttons: [],
    });

    xr.submitFrame({
      time: 0,
      headPosition: { x: 0, y: 1.7, z: 0 },
      headRotation: { x: 0, y: 0, z: 0 },
      views: [],
      controllers,
      hands: new Map(),
    });

    xr.update(1 / 60);
    expect(grabs).toContain('right-hand');
  });

  it('event on/off works correctly', () => {
    const xr = new WebXRSystem();
    const events: string[] = [];
    const cb = () => events.push('fired');

    xr.on('sessionstart', cb);
    xr.enterVR();
    expect(events.length).toBe(1);

    xr.off('sessionstart', cb);
    xr.exit();
    xr.enterVR();
    // sessionstart should not fire again
    expect(events.length).toBe(1);
  });
});

// ============================================================================
// DeltaCompressor Tests
// ============================================================================

import {
  DeltaCompressor,
  InterestManager,
  EntityInterpolator,
  NetworkSystem,
} from '../../../../core/src/network/NetworkSystem';

describe('DeltaCompressor', () => {
  it('returns full state on first compress', () => {
    const c = new DeltaCompressor();
    const delta = c.compress('e1', { x: 1, y: 2, name: 'test' });
    expect(delta).toEqual({ x: 1, y: 2, name: 'test' });
  });

  it('returns null when nothing changed', () => {
    const c = new DeltaCompressor();
    c.compress('e1', { x: 1, y: 2 });
    const delta = c.compress('e1', { x: 1, y: 2 });
    expect(delta).toBeNull();
  });

  it('returns only changed fields', () => {
    const c = new DeltaCompressor();
    c.compress('e1', { x: 1, y: 2, z: 3 });
    const delta = c.compress('e1', { x: 1, y: 5, z: 3 });
    expect(delta).toEqual({ y: 5 });
  });

  it('marks removed keys as null', () => {
    const c = new DeltaCompressor();
    c.compress('e1', { x: 1, color: 'red' });
    const delta = c.compress('e1', { x: 1 });
    expect(delta).toEqual({ color: null });
  });

  it('decompress reconstructs full state', () => {
    const c = new DeltaCompressor();
    c.compress('e1', { x: 1, y: 2, z: 3 });
    const full = c.decompress('e1', { y: 5 });
    expect(full).toEqual({ x: 1, y: 5, z: 3 });
  });

  it('decompress handles key removal', () => {
    const c = new DeltaCompressor();
    c.compress('e1', { a: 1, b: 2 });
    const full = c.decompress('e1', { b: null });
    expect(full.a).toBe(1);
    expect(full.b).toBeUndefined();
  });

  it('reset clears cached state', () => {
    const c = new DeltaCompressor();
    c.compress('e1', { x: 1 });
    c.reset('e1');
    const delta = c.compress('e1', { x: 1 });
    expect(delta).toEqual({ x: 1 }); // Full state again
  });
});

// ============================================================================
// InterestManager Tests
// ============================================================================

describe('InterestManager', () => {
  it('filters entities within radius', () => {
    const im = new InterestManager();
    im.setPlayerPosition({ x: 0, y: 0, z: 0 });
    im.setRadius(10);

    const entities = [
      { id: 'near', position: [5, 0, 0] },
      { id: 'far', position: [100, 0, 0] },
      { id: 'edge', position: [10, 0, 0] },
    ];

    const relevant = im.filterRelevant(entities);
    expect(relevant.length).toBe(2);
    expect(relevant.map((e) => e.id)).toContain('near');
    expect(relevant.map((e) => e.id)).toContain('edge');
  });

  it('isRelevant checks single position', () => {
    const im = new InterestManager();
    im.setPlayerPosition({ x: 0, y: 0, z: 0 });
    im.setRadius(5);

    expect(im.isRelevant({ x: 3, y: 0, z: 0 })).toBe(true);
    expect(im.isRelevant({ x: 10, y: 0, z: 0 })).toBe(false);
  });

  it('updates with player position', () => {
    const im = new InterestManager();
    im.setPlayerPosition({ x: 50, y: 0, z: 50 });
    im.setRadius(10);

    expect(im.isRelevant({ x: 55, y: 0, z: 55 })).toBe(true);
    expect(im.isRelevant({ x: 0, y: 0, z: 0 })).toBe(false);
  });
});

// ============================================================================
// EntityInterpolator Tests
// ============================================================================

describe('EntityInterpolator', () => {
  it('returns null for unknown entity', () => {
    const interp = new EntityInterpolator();
    expect(interp.getInterpolated('unknown')).toBeNull();
  });

  it('returns last state for single snapshot', () => {
    const interp = new EntityInterpolator();
    interp.pushState({
      id: 'e1',
      position: [1, 2, 3],
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      timestamp: 0,
      components: {},
    });

    const state = interp.getInterpolated('e1');
    expect(state).not.toBeNull();
    expect(state!.position.x).toBe(1);
  });

  it('removeEntity clears buffer', () => {
    const interp = new EntityInterpolator();
    interp.pushState({
      id: 'e1',
      position: [0, 0, 0],
      rotation: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      timestamp: 0,
      components: {},
    });
    interp.removeEntity('e1');
    expect(interp.getInterpolated('e1')).toBeNull();
  });
});

// ============================================================================
// NetworkSystem Integration Tests
// ============================================================================

describe('NetworkSystem', () => {
  it('starts disconnected', () => {
    const net = new NetworkSystem();
    expect(net.getConnectionState()).toBe('disconnected');
  });

  it('connect transitions to connected', () => {
    const net = new NetworkSystem();
    net.configure('ws://localhost:8080');
    net.connect();
    expect(net.getConnectionState()).toBe('connected');
  });

  it('queueUpdate + flush produces delta', () => {
    const net = new NetworkSystem();
    net.configure('ws://localhost:8080');
    net.connect();

    net.queueUpdate('player1', { x: 1, y: 2, z: 3, health: 100 });
    expect(net.getPendingDeltaCount()).toBe(1);

    const deltas = net.flush();
    expect(deltas.length).toBe(1);
    expect(deltas[0].entityId).toBe('player1');
    expect(net.getPendingDeltaCount()).toBe(0);
  });

  it('delta compression only sends changes', () => {
    const net = new NetworkSystem();
    net.configure('ws://localhost:8080');
    net.connect();

    net.queueUpdate('p1', { x: 1, y: 2, z: 3 });
    net.flush(); // First sync (full state)

    net.queueUpdate('p1', { x: 1, y: 5, z: 3 }); // Only y changed
    const deltas = net.flush();
    expect(deltas.length).toBe(1);
    expect(deltas[0].fields).toEqual({ y: 5 });
  });

  it('receiveDeltas feeds into interpolator', () => {
    const net = new NetworkSystem();
    net.configure('ws://localhost:8080');
    net.connect();

    net.receiveDeltas([
      {
        entityId: 'remote1',
        fields: {
          position: [10, 0, 5],
          rotation: { x: 0, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
        },
        timestamp: performance.now(),
        sequence: 0,
      },
    ]);

    const state = net.interpolator.getInterpolated('remote1');
    expect(state).not.toBeNull();
  });

  it('disconnect clears state', () => {
    const net = new NetworkSystem();
    net.configure('ws://localhost:8080');
    net.connect();
    net.queueUpdate('p1', { x: 1 });
    net.disconnect();
    expect(net.getConnectionState()).toBe('disconnected');
    expect(net.getPendingDeltaCount()).toBe(0);
  });

  it('metrics track deltas sent/received', () => {
    const net = new NetworkSystem();
    net.configure('ws://localhost:8080');
    net.connect();

    net.queueUpdate('p1', { x: 1 });
    net.flush();

    const m = net.getMetrics();
    expect(m.deltasSent).toBe(1);
  });
});
