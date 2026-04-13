/**
 * HandMenuSystem Unit Tests
 *
 * Tests VR hand menu: construction, update loop,
 * show/hide transitions, palm-facing detection, debouncing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandMenuSystem } from '../HandMenu';

// Mock runtime with minimum required methods
function createMockRuntime() {
  return {
    vrContext: {
      hands: {
        left: {
          position: [0, 1, -0.5],
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
    },
    mountObject: vi.fn(),
    unmountObject: vi.fn(),
    createNode: vi.fn(),
  } as any;
}

describe('HandMenuSystem', () => {
  let runtime: ReturnType<typeof createMockRuntime>;
  let menu: HandMenuSystem;

  beforeEach(() => {
    runtime = createMockRuntime();
    menu = new HandMenuSystem(runtime);
  });

  describe('constructor', () => {
    it('should create without throwing', () => {
      expect(menu).toBeDefined();
    });
  });

  describe('update', () => {
    it('should not throw when no VR context is available', () => {
      const noVR = { vrContext: null } as any;
      const noVRMenu = new HandMenuSystem(noVR);
      expect(() => noVRMenu.update(0.016)).not.toThrow();
    });

    it('should not throw when left hand is null', () => {
      runtime.vrContext = { hands: { left: null } };
      expect(() => menu.update(0.016)).not.toThrow();
    });

    it('should not show menu when palm is not facing user', () => {
      // Default checkPalmFacingUser returns false
      menu.update(0.016);
      expect(runtime.mountObject).not.toHaveBeenCalled();
    });
  });

  describe('checkPalmFacingUser', () => {
    it('should return false by default (placeholder implementation)', () => {
      // Access private method via prototype for testing
      const result = (menu as any).checkPalmFacingUser({
        position: [0, 1, 0],
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      });
      expect(result).toBe(false);
    });
  });

  describe('showMenu / hideMenu', () => {
    it('should mount menu and set up transitions', () => {
      // Directly invoke private showMenu
      const hand = { position: [-0.2, 1.2, -0.3] };
      (menu as any).showMenu(hand);

      expect(runtime.mountObject).toHaveBeenCalled();
      expect((menu as any).isMenuVisible).toBe(true);
      expect((menu as any).menuNodeId).toBeTruthy();
    });

    it('should position menu near hand position', () => {
      const hand = { position: [0.1, 1.5, -0.2] };
      (menu as any).showMenu(hand);

      const mountedNode = runtime.mountObject.mock.calls[0][0];
      expect(mountedNode.properties.position.x).toBe(0.1);
      // y should be offset above hand
      expect(mountedNode.properties.position.y).toBeGreaterThan(1.5);
    });

    it('should not show menu again if already showing', () => {
      const hand = { position: [0, 1, 0] };
      (menu as any).showMenu(hand);
      (menu as any).showMenu(hand);
      expect(runtime.mountObject).toHaveBeenCalledTimes(1);
    });

    it('should hide menu and reset state', () => {
      const hand = { position: [0, 1, 0] };
      (menu as any).showMenu(hand);
      (menu as any).hideMenu();

      expect((menu as any).isMenuVisible).toBe(false);
      expect((menu as any).menuNodeId).toBeNull();
    });

    it('should not throw when hiding with no menu', () => {
      expect(() => (menu as any).hideMenu()).not.toThrow();
    });
  });

  describe('debounce', () => {
    it('should set lastToggleTime when showing menu', () => {
      const hand = { position: [0, 1, 0] };
      const before = Date.now();
      (menu as any).showMenu(hand);
      expect((menu as any).lastToggleTime).toBeGreaterThanOrEqual(before);
    });

    it('should set lastToggleTime when hiding menu', () => {
      const hand = { position: [0, 1, 0] };
      (menu as any).showMenu(hand);
      const beforeHide = Date.now();
      (menu as any).hideMenu();
      expect((menu as any).lastToggleTime).toBeGreaterThanOrEqual(beforeHide);
    });
  });

  describe('transitions', () => {
    it('should start with zero opacity and scale', () => {
      const hand = { position: [0, 1, 0] };
      (menu as any).showMenu(hand);

      const mountedNode = runtime.mountObject.mock.calls[0][0];
      expect(mountedNode.properties.opacity).toBe(0);
      expect(mountedNode.properties.scale).toBe(0);
    });

    it('should create transition system for animations', () => {
      expect((menu as any).transitions).toBeDefined();
    });
  });
});
