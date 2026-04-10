/**
 * Hololand Integration Tests
 *
 * Tests for the Hololand runtime integration modules:
 * - WorldDefinitionSchema
 * - HololandIntegration
 * - StreamingProtocol
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // WorldDefinitionSchema
  createWorldDefinition,
  createWorldMetadata,
  createWorldConfig,
  // HololandIntegration
  HololandClient,
  getHololandClient,
  connectToHololand,
  disconnectFromHololand,
  // StreamingProtocol
  StreamProtocol,
  getStreamProtocol,
  PROTOCOL_VERSION,
  MAX_MESSAGE_SIZE,
  HEARTBEAT_INTERVAL,
} from '../hololand';

// ============================================================================
// WorldDefinitionSchema Tests
// ============================================================================

describe('WorldDefinitionSchema', () => {
  describe('createWorldMetadata', () => {
    it('should create metadata object with provided values', () => {
      const metadata = createWorldMetadata('world-001', 'Test World', {
        version: '1.0.0',
      });

      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('world-001');
      expect(metadata.name).toBe('Test World');
      expect(metadata.version).toBe('1.0.0');
    });
  });

  describe('createWorldConfig', () => {
    it('should create config with defaults', () => {
      const config = createWorldConfig();

      expect(config).toBeDefined();
      expect(config.physics).toBeDefined();
      expect(config.rendering).toBeDefined();
      expect(config.audio).toBeDefined();
      expect(config.networking).toBeDefined();
    });

    it('should have default physics config', () => {
      const config = createWorldConfig();

      expect(config.physics.engine).toBe('rapier');
      expect(config.physics.gravity).toBeDefined();
    });

    it('should have default rendering config', () => {
      const config = createWorldConfig();

      expect(config.rendering.shadows).toBe(true);
      expect(config.rendering.targetFPS).toBe(72);
    });

    it('should have default networking config', () => {
      const config = createWorldConfig();

      expect(config.networking.tickRate).toBe(20);
      expect(config.networking.protocol).toBe('websocket');
    });
  });

  describe('createWorldDefinition', () => {
    it('should create world definition with metadata', () => {
      const world = createWorldDefinition('test-world', 'Test');

      expect(world).toBeDefined();
      expect(world.metadata).toBeDefined();
      expect(world.metadata.id).toBe('test-world');
    });

    it('should include config', () => {
      const world = createWorldDefinition('test-world', 'Test');

      expect(world.config).toBeDefined();
    });

    it('should have zones and spawnPoints arrays', () => {
      const world = createWorldDefinition('test-world', 'Test');

      expect(world.zones).toBeDefined();
      expect(Array.isArray(world.zones)).toBe(true);
      expect(world.spawnPoints).toBeDefined();
      expect(Array.isArray(world.spawnPoints)).toBe(true);
    });
  });
});

// ============================================================================
// HololandIntegration Tests
// ============================================================================

describe('HololandIntegration', () => {
  let client: HololandClient;

  beforeEach(() => {
    HololandClient.resetInstance();
    client = getHololandClient();
  });

  afterEach(() => {
    HololandClient.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getHololandClient();
      const instance2 = getHololandClient();
      expect(instance1).toBe(instance2);
    });
  });

  describe('world management', () => {
    it('should have null current world initially', () => {
      expect(client.getCurrentWorld()).toBeNull();
    });

    it('should require connection to register world', async () => {
      const world = createWorldDefinition('test-world', 'Test');

      // Should throw when not connected
      await expect(client.registerWorld(world)).rejects.toThrow('Not connected');
    });
  });

  describe('event system', () => {
    it('should emit events', () => {
      const handler = vi.fn();
      client.on('connection:state_changed', handler);

      // Simulate state change
      client.emit('connection:state_changed', { state: 'connecting' });

      expect(handler).toHaveBeenCalledWith({ state: 'connecting' });
    });

    it('should allow unsubscribing', () => {
      const handler = vi.fn();
      const unsubscribe = client.on('connection:state_changed', handler);

      unsubscribe();
      client.emit('connection:state_changed', { state: 'connected' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('services', () => {
    it('should provide service interfaces', () => {
      const services = client.getServices();

      expect(services).toBeDefined();
      expect(services).toHaveProperty('assets');
      expect(services).toHaveProperty('networking');
      expect(services).toHaveProperty('audio');
      expect(services).toHaveProperty('physics');
      expect(services).toHaveProperty('input');
    });
  });
});

describe('connectToHololand / disconnectFromHololand', () => {
  afterEach(() => {
    HololandClient.resetInstance();
  });

  it('should be async functions', () => {
    expect(typeof connectToHololand).toBe('function');
    expect(typeof disconnectFromHololand).toBe('function');
  });
});

// ============================================================================
// StreamingProtocol Tests
// ============================================================================

describe('StreamingProtocol', () => {
  describe('protocol constants', () => {
    it('should define protocol version', () => {
      expect(PROTOCOL_VERSION).toBe('1.0.0');
    });

    it('should define max message size', () => {
      expect(MAX_MESSAGE_SIZE).toBe(64 * 1024);
    });

    it('should define heartbeat interval', () => {
      expect(HEARTBEAT_INTERVAL).toBe(5000);
    });
  });

  describe('StreamProtocol', () => {
    let protocol: StreamProtocol;

    beforeEach(() => {
      StreamProtocol.resetInstance();
      protocol = getStreamProtocol();
    });

    afterEach(() => {
      StreamProtocol.resetInstance();
    });

    describe('singleton', () => {
      it('should return same instance', () => {
        const instance1 = getStreamProtocol();
        const instance2 = getStreamProtocol();
        expect(instance1).toBe(instance2);
      });
    });

    describe('connection state', () => {
      it('should start disconnected', () => {
        expect(protocol.isConnected()).toBe(false);
      });
    });

    describe('message handlers', () => {
      it('should register message handlers', () => {
        const handler = vi.fn();
        const unsubscribe = protocol.on('entity_update', handler);

        expect(typeof unsubscribe).toBe('function');
      });

      it('should allow unsubscribing handlers', () => {
        const handler = vi.fn();
        const unsubscribe = protocol.on('entity_update', handler);

        // Unsubscribe should not throw
        expect(() => unsubscribe()).not.toThrow();
      });
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Hololand Integration - End to End', () => {
  afterEach(() => {
    HololandClient.resetInstance();
    StreamProtocol.resetInstance();
  });

  it('should create world with correct structure', () => {
    // Create world with all components
    const world = createWorldDefinition('e2e-world', 'E2E Test World');

    // Verify world structure
    expect(world.metadata.id).toBe('e2e-world');
    expect(world.metadata.name).toBe('E2E Test World');
    expect(world.config).toBeDefined();
    expect(world.config.physics).toBeDefined();
    expect(world.config.rendering).toBeDefined();
    expect(world.zones).toBeDefined();
    expect(world.spawnPoints).toBeDefined();
  });

  it('should have independent client and protocol instances', () => {
    const client = getHololandClient();
    const protocol = getStreamProtocol();

    // Both should exist independently
    expect(client).toBeDefined();
    expect(protocol).toBeDefined();

    // Both should start disconnected
    expect(protocol.isConnected()).toBe(false);
  });
});
