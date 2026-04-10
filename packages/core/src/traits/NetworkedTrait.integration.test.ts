/**
 * NetworkedTrait WebSocket Integration Test
 *
 * Tests multiplayer synchronization with WebSocket transport
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { NetworkedTrait, createNetworkedTrait } from './NetworkedTrait';
import { WebSocketTransport } from '../network/WebSocketTransport';

describe('NetworkedTrait - WebSocket Integration', () => {
  let trait: NetworkedTrait;
  let wsTransport: WebSocketTransport;

  beforeEach(() => {
    trait = createNetworkedTrait({
      mode: 'owner',
      syncRate: 20,
      syncProperties: ['position', 'rotation', 'health'],
    });
  });

  afterEach(() => {
    trait.disconnect();
  });

  it('should initialize with default local config', () => {
    expect(trait.isConnected()).toBe(false);
    expect(trait.getActiveTransport()).toBe('local');
  });

  it('should track pending updates', () => {
    trait.setProperty('position', [0, 1, 0]);
    trait.setProperty('rotation', [0, 0, 0, 1]);

    const state = trait.getState();
    expect(state.position).toEqual([0, 1, 0]);
    expect(state.rotation).toEqual([0, 0, 0, 1]);
  });

  it('should flush pending updates', () => {
    trait.setProperty('health', 100);
    trait.setProperty('health', 75);

    const updates = trait.flushUpdates();
    expect(updates.health).toBe(75);

    const nextUpdates = trait.flushUpdates();
    expect(Object.keys(nextUpdates).length).toBe(0);
  });

  it('should emit property changed events', async () => {
    const listener = vi.fn();
    trait.on('propertyChanged', listener);

    trait.setProperty('position', [1, 2, 3]);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'propertyChanged',
        property: 'position',
        value: [1, 2, 3],
      })
    );
  });

  it('should apply remote state updates', () => {
    trait.applyState({
      position: [5, 5, 5],
      health: 50,
    });

    expect(trait.getProperty('position')).toEqual([5, 5, 5]);
    expect(trait.getProperty('health')).toBe(50);
  });

  it('should manage ownership', async () => {
    expect(trait.isLocalOwner()).toBe(true);

    trait.releaseOwnership();
    expect(trait.isLocalOwner()).toBe(false);
  });

  it('should emit connected event on local connection', async () => {
    const listener = vi.fn();
    trait.on('connected', listener);

    await trait.connect('local');

    expect(trait.isConnected()).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('should emit disconnected event', async () => {
    await trait.connect('local');
    const listener = vi.fn();
    trait.on('disconnected', listener);

    trait.disconnect();

    expect(trait.isConnected()).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it('should serialize state to ArrayBuffer', () => {
    trait.setProperty('position', [1, 2, 3]);
    trait.setProperty('health', 100);

    const buffer = trait.serialize();
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('should deserialize state from ArrayBuffer', () => {
    trait.setProperty('position', [1, 2, 3]);
    const originalBuffer = trait.serialize();

    const trait2 = createNetworkedTrait();
    trait2.deserialize(originalBuffer);

    expect(trait2.getProperty('position')).toEqual([1, 2, 3]);
  });

  it('should apply remote updates to interpolation buffer', () => {
    const config = trait.getInterpolationConfig();
    expect(config.enabled).toBe(true);
    expect(config.delay).toBe(100);

    trait.applyState({
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
    });

    const interpState = trait.getInterpolatedState(100);
    expect(interpState).not.toBeNull();
  });

  it('should rate limit sync rate', async () => {
    await trait.connect('local');
    trait.setProperty('position', [0, 0, 0]);

    // First sync should pass
    let shouldSync = trait.shouldSync();
    expect(shouldSync).toBe(true);

    // Immediate next sync should fail (rate limited)
    shouldSync = trait.shouldSync();
    expect(shouldSync).toBe(false);
  });

  it('should get configuration', () => {
    const config = trait.getConfig();
    expect(config.mode).toBe('owner');
    expect(config.syncRate).toBe(20);
  });

  it('should provide entity ID', () => {
    const entityId = trait.getEntityId();
    expect(entityId).toMatch(/^entity_/);
  });

  it('should get interpolation config defaults', () => {
    const config = trait.getInterpolationConfig();
    expect(config.enabled).toBe(true);
    expect(config.mode).toBe('linear');
    expect(config.delay).toBe(100);
    expect(config.snapThreshold).toBe(5);
  });

  describe('WebSocket Transport', () => {
    it('should support WebSocket connection method', async () => {
      // Mock the WebSocketTransport to avoid network calls
      vi.mock('../network/WebSocketTransport');

      // This test verifies the integration point exists
      expect(trait.connectWebSocket).toBeDefined();
      expect(typeof trait.connectWebSocket).toBe('function');
    });

    it('should support WebRTC connection method', async () => {
      // Mock the WebRTCTransport to avoid network calls
      vi.mock('../network/WebRTCTransport');

      // This test verifies the integration point exists
      expect(trait.connectWebRTC).toBeDefined();
      expect(typeof trait.connectWebRTC).toBe('function');
    });

    it('should track active transport type', async () => {
      expect(trait.getActiveTransport()).toBe('local');

      await trait.connect('local');
      expect(trait.getActiveTransport()).toBe('local');
    });
  });
});
