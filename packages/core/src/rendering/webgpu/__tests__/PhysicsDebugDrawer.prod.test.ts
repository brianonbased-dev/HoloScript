/**
 * PhysicsDebugDrawer Production Tests
 *
 * Tests construction with mock world + renderer, enable/disable,
 * update cycle (mesh creation/removal/color-coding), and clear.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhysicsDebugDrawer } from '../PhysicsDebugDrawer';

// Mock renderer
function mockRenderer() {
  return {
    createElement: vi.fn(() => ({
      position: null,
      rotation: null,
      material: { color: '#000' },
    })),
    destroy: vi.fn(),
  };
}

// Mock physics world
function mockWorld(bodies: Record<string, any> = {}) {
  const states: Record<string, any> = {};
  for (const [id, body] of Object.entries(bodies)) {
    states[id] = {
      position: body.position || { x: 0, y: 0, z: 0 },
      rotation: body.rotation || { x: 0, y: 0, z: 0, w: 1 },
      isSleeping: body.sleeping || false,
    };
  }
  return {
    getStates: vi.fn(() => states),
    getBody: vi.fn((id: string) => bodies[id] || null),
  };
}

describe('PhysicsDebugDrawer — Production', () => {
  it('constructs with world and renderer', () => {
    const drawer = new PhysicsDebugDrawer(mockWorld() as any, mockRenderer() as any);
    expect(drawer).toBeDefined();
  });

  it('setEnabled enables/disables', () => {
    const renderer = mockRenderer();
    const drawer = new PhysicsDebugDrawer(mockWorld() as any, renderer as any);

    drawer.setEnabled(true);
    // Enabling doesn't create meshes until update
    expect(renderer.createElement).not.toHaveBeenCalled();

    drawer.setEnabled(false);
    // Disabling calls clear(), which destroys all meshes
  });

  it('update creates debug meshes for bodies', () => {
    const world = mockWorld({
      b1: { shape: 'box', shapeParams: [1, 1, 1] },
    });
    const renderer = mockRenderer();
    const drawer = new PhysicsDebugDrawer(world as any, renderer as any);

    drawer.setEnabled(true);
    drawer.update();

    expect(renderer.createElement).toHaveBeenCalledWith('mesh', expect.objectContaining({ wireframe: true }));
  });

  it('update colors sleeping bodies grey', () => {
    const world = mockWorld({
      b1: { shape: 'sphere', shapeParams: [0.5], sleeping: true },
    });
    const renderer = mockRenderer();
    const mesh = { position: null, rotation: null, material: { color: '#000' } };
    renderer.createElement.mockReturnValue(mesh);
    const drawer = new PhysicsDebugDrawer(world as any, renderer as any);

    drawer.setEnabled(true);
    drawer.update();

    expect(mesh.material.color).toBe('#333333');
  });

  it('update colors active bodies green', () => {
    const world = mockWorld({
      b1: { shape: 'box', shapeParams: [1, 1, 1], sleeping: false },
    });
    const renderer = mockRenderer();
    const mesh = { position: null, rotation: null, material: { color: '#000' } };
    renderer.createElement.mockReturnValue(mesh);
    const drawer = new PhysicsDebugDrawer(world as any, renderer as any);

    drawer.setEnabled(true);
    drawer.update();

    expect(mesh.material.color).toBe('#00ff00');
  });

  it('clear destroys all debug meshes', () => {
    const world = mockWorld({
      b1: { shape: 'box', shapeParams: [1, 1, 1] },
    });
    const renderer = mockRenderer();
    const drawer = new PhysicsDebugDrawer(world as any, renderer as any);

    drawer.setEnabled(true);
    drawer.update();
    drawer.clear();

    expect(renderer.destroy).toHaveBeenCalled();
  });

  it('update handles capsule shape', () => {
    const world = mockWorld({
      c1: { shape: 'capsule', shapeParams: [0.3, 1.5] },
    });
    const renderer = mockRenderer();
    const drawer = new PhysicsDebugDrawer(world as any, renderer as any);

    drawer.setEnabled(true);
    drawer.update();

    expect(renderer.createElement).toHaveBeenCalledWith('mesh', expect.objectContaining({ geometry: 'capsule' }));
  });

  it('update cleans up removed bodies', () => {
    const bodies: Record<string, any> = {
      b1: { shape: 'box', shapeParams: [1, 1, 1] },
    };
    const world = mockWorld(bodies);
    const renderer = mockRenderer();
    const drawer = new PhysicsDebugDrawer(world as any, renderer as any);

    drawer.setEnabled(true);
    drawer.update();

    // Remove body from world
    (world.getStates as any).mockReturnValue({});
    drawer.update();

    expect(renderer.destroy).toHaveBeenCalled();
  });
});
