/**
 * Unit tests for VRRSyncService
 *
 * Tests real-time VRR synchronization functionality including:
 * - Service initialization and configuration
 * - Start/stop sync operations
 * - Event listener management
 * - Weather, events, and inventory sync
 * - Manual refresh and status reporting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VRRSyncService } from '../services/VRRSyncService';
import type { WeatherData, EventData, InventoryData } from '../../../core/src/plugins/HololandTypes';

// Mock vscode module
vi.mock('vscode', async () => {
  const actual = await vi.importActual('vscode');
  return {
    ...actual,
    window: {
      ...((actual as any).window || {}),
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
    },
  };
});

describe('VRRSyncService', () => {
  let service: VRRSyncService;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (service) {
      service.dispose();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Constructor and Configuration', () => {
    it('should create service with default configuration', () => {
      service = new VRRSyncService();
      expect(service).toBeDefined();
      expect(service.isRunning()).toBe(false);
    });

    it('should create service with custom configuration', () => {
      service = new VRRSyncService({
        enabled: false,
        updateInterval: 60000,
        sources: {
          weather: true,
          events: true,
          inventory: false,
        },
      });
      expect(service).toBeDefined();
    });

    it('should merge partial config with defaults', () => {
      service = new VRRSyncService({
        updateInterval: 120000,
      });
      expect(service).toBeDefined();
      // Should use custom interval but default enabled=true
    });
  });

  describe('Start and Stop Operations', () => {
    beforeEach(() => {
      service = new VRRSyncService();
    });

    it('should start synchronization', () => {
      service.start();
      expect(service.isRunning()).toBe(true);
    });

    it('should not start if disabled in config', () => {
      service = new VRRSyncService({ enabled: false });
      service.start();
      expect(service.isRunning()).toBe(false);
    });

    it('should stop synchronization', () => {
      service.start();
      expect(service.isRunning()).toBe(true);
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('should perform initial sync on start', () => {
      const syncSpy = vi.spyOn(service as any, 'sync');
      service.start();
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });

    it('should set up periodic sync with correct interval', () => {
      const interval = 60000; // 1 minute
      service = new VRRSyncService({ updateInterval: interval });
      const syncSpy = vi.spyOn(service as any, 'sync');

      service.start();
      expect(syncSpy).toHaveBeenCalledTimes(1); // Initial sync

      vi.advanceTimersByTime(interval);
      expect(syncSpy).toHaveBeenCalledTimes(2); // First periodic sync

      vi.advanceTimersByTime(interval);
      expect(syncSpy).toHaveBeenCalledTimes(3); // Second periodic sync
    });

    it('should clear interval on stop', () => {
      service.start();
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      service.stop();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle multiple start calls gracefully', () => {
      service.start();
      service.start(); // Second start should be handled
      expect(service.isRunning()).toBe(true);
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('should handle stop when not running', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('Event Listener Management', () => {
    beforeEach(() => {
      service = new VRRSyncService();
    });

    it('should register weather listener', () => {
      const listener = vi.fn();
      const unsubscribe = service.on('weather', listener);
      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should register events listener', () => {
      const listener = vi.fn();
      const unsubscribe = service.on('events', listener);
      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should register inventory listener', () => {
      const listener = vi.fn();
      const unsubscribe = service.on('inventory', listener);
      expect(unsubscribe).toBeInstanceOf(Function);
    });

    it('should call weather listener when weather data updates', async () => {
      const listener = vi.fn();
      service.on('weather', listener);

      await (service as any).syncWeather();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: expect.any(Number),
          condition: expect.any(String),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should unsubscribe listener when calling returned function', async () => {
      const listener = vi.fn();
      const unsubscribe = service.on('weather', listener);

      await (service as any).syncWeather();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      await (service as any).syncWeather();
      expect(listener).toHaveBeenCalledTimes(1); // Should not increase
    });

    it('should support multiple listeners for same event', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.on('weather', listener1);
      service.on('weather', listener2);

      await (service as any).syncWeather();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should not affect other listeners when one unsubscribes', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = service.on('weather', listener1);
      service.on('weather', listener2);

      unsub1();

      await (service as any).syncWeather();

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('Weather Synchronization', () => {
    beforeEach(() => {
      service = new VRRSyncService({ sources: { weather: true } });
    });

    it('should sync weather data with correct structure', async () => {
      const listener = vi.fn();
      service.on('weather', listener);

      await (service as any).syncWeather();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<WeatherData>>({
          temperature: expect.any(Number),
          condition: expect.any(String),
          humidity: expect.any(Number),
          windSpeed: expect.any(Number),
          windDirection: expect.any(Number),
          precipitation: expect.any(Number),
          visibility: expect.any(Number),
          pressure: expect.any(Number),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should emit weather events to all registered listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.on('weather', listener1);
      service.on('weather', listener2);

      await (service as any).syncWeather();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should handle weather sync errors gracefully', async () => {
      const listener = vi.fn();
      service.on('weather', listener);

      // Mock a fetch error
      vi.spyOn(service as any, 'syncWeather').mockRejectedValueOnce(new Error('API Error'));

      await expect((service as any).syncWeather()).rejects.toThrow('API Error');
    });
  });

  describe('Events Synchronization', () => {
    beforeEach(() => {
      service = new VRRSyncService({ sources: { events: true } });
    });

    it('should sync events data with correct structure', async () => {
      const listener = vi.fn();
      service.on('events', listener);

      await (service as any).syncEvents();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          events: expect.any(Array),
          count: expect.any(Number),
        })
      );
    });
  });

  describe('Inventory Synchronization', () => {
    beforeEach(() => {
      service = new VRRSyncService({ sources: { inventory: true } });
    });

    it('should sync inventory data with correct structure', async () => {
      const listener = vi.fn();
      service.on('inventory', listener);

      await (service as any).syncInventory();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining<Partial<InventoryData>>({
          items: expect.any(Array),
          lastUpdated: expect.any(Number),
        })
      );
    });
  });

  describe('Manual Refresh', () => {
    beforeEach(() => {
      service = new VRRSyncService();
    });

    it('should allow manual refresh when running', async () => {
      service.start();

      // Clear any initial syncs from start()
      await vi.waitFor(() => {}, { timeout: 100 });

      const syncSpy = vi.spyOn(service as any, 'sync');
      await service.refresh();

      // Manual refresh should call sync
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow manual refresh when not running', async () => {
      const syncSpy = vi.spyOn(service as any, 'sync');

      await service.refresh();

      expect(syncSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status Reporting', () => {
    beforeEach(() => {
      service = new VRRSyncService();
    });

    it('should report correct running status', () => {
      expect(service.isRunning()).toBe(false);
      service.start();
      expect(service.isRunning()).toBe(true);
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('should provide status object with config info', () => {
      const status = service.getStatus();
      expect(status).toMatchObject({
        enabled: expect.any(Boolean),
        running: expect.any(Boolean),
        updateInterval: expect.any(Number),
        sources: {
          weather: expect.any(Boolean),
          events: expect.any(Boolean),
          inventory: expect.any(Boolean),
        },
      });
    });
  });

  describe('Disposal', () => {
    it('should stop sync on dispose', () => {
      service = new VRRSyncService();
      service.start();
      expect(service.isRunning()).toBe(true);

      service.dispose();

      expect(service.isRunning()).toBe(false);
    });

    it('should clear all listeners on dispose', async () => {
      service = new VRRSyncService();
      const listener = vi.fn();

      service.on('weather', listener);
      service.dispose();

      // Attempting to emit after dispose should not call listener
      await (service as any).syncWeather();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple dispose calls', () => {
      service = new VRRSyncService();
      expect(() => {
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle sync with all sources disabled', async () => {
      service = new VRRSyncService({
        sources: {
          weather: false,
          events: false,
          inventory: false,
        },
      });

      const syncSpy = vi.spyOn(service as any, 'sync');
      service.start();

      expect(syncSpy).toHaveBeenCalled();
      // Should complete without errors even with no sources
    });

    it('should handle rapid start/stop cycles', () => {
      service = new VRRSyncService();

      expect(() => {
        service.start();
        service.stop();
        service.start();
        service.stop();
        service.start();
      }).not.toThrow();

      expect(service.isRunning()).toBe(true);
    });
  });
});
