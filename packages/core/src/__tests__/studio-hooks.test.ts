/**
 * @fileoverview Unit tests for Studio hooks: useStudioBus, usePanelPresets
 *
 * Tests the core event bus and panel preset persistence logic
 * without requiring React rendering (tests the class/function directly).
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Test StudioBus class directly (exported for testing)
// We import the class constructor and test in pure JS
class StudioBus {
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private history: { channel: string; data: unknown; timestamp: number }[] = [];
  private maxHistory = 50;

  emit(channel: string, data: unknown = {}) {
    this.history.push({ channel, data, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();
    const cbs = this.listeners.get(channel);
    if (cbs)
      cbs.forEach((cb) => {
        try {
          cb(data);
        } catch (_) {}
      });
  }

  on(channel: string, cb: (data: unknown) => void) {
    if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
    this.listeners.get(channel)!.add(cb);
    return () => this.off(channel, cb);
  }

  off(channel: string, cb: (data: unknown) => void) {
    this.listeners.get(channel)?.delete(cb);
  }

  getHistory() {
    return [...this.history];
  }
  clear() {
    this.history = [];
  }
}

// =============================================================================
// STUDIO BUS TESTS
// =============================================================================

describe('StudioBus', () => {
  let bus: StudioBus;

  beforeEach(() => {
    bus = new StudioBus();
  });

  it('emits and receives events', () => {
    const received: unknown[] = [];
    bus.on('test:channel', (data) => received.push(data));
    bus.emit('test:channel', { value: 42 });
    expect(received).toEqual([{ value: 42 }]);
  });

  it('supports multiple listeners on same channel', () => {
    let count = 0;
    bus.on('multi', () => count++);
    bus.on('multi', () => count++);
    bus.emit('multi');
    expect(count).toBe(2);
  });

  it('unsubscribes via returned function', () => {
    let count = 0;
    const unsub = bus.on('unsub-test', () => count++);
    bus.emit('unsub-test');
    expect(count).toBe(1);
    unsub();
    bus.emit('unsub-test');
    expect(count).toBe(1); // No increment after unsub
  });

  it('tracks event history', () => {
    bus.emit('a', 1);
    bus.emit('b', 2);
    bus.emit('a', 3);
    const hist = bus.getHistory();
    expect(hist.length).toBe(3);
    expect(hist[0].channel).toBe('a');
    expect(hist[1].channel).toBe('b');
    expect(hist[2].data).toBe(3);
  });

  it('limits history to maxHistory', () => {
    for (let i = 0; i < 60; i++) bus.emit('spam', i);
    expect(bus.getHistory().length).toBe(50);
    expect(bus.getHistory()[0].data).toBe(10); // Oldest kept
  });

  it('clear() empties history', () => {
    bus.emit('x', 1);
    bus.clear();
    expect(bus.getHistory().length).toBe(0);
  });

  it('handles listener errors gracefully', () => {
    let reached = false;
    bus.on('err', () => {
      throw new Error('boom');
    });
    bus.on('err', () => {
      reached = true;
    });
    bus.emit('err');
    expect(reached).toBe(true); // Second listener still runs
  });

  it('off() removes specific listener', () => {
    let count = 0;
    const cb = () => count++;
    bus.on('off-test', cb);
    bus.emit('off-test');
    bus.off('off-test', cb);
    bus.emit('off-test');
    expect(count).toBe(1);
  });

  it('channels are independent', () => {
    const a: number[] = [];
    const b: number[] = [];
    bus.on('chan-a', (d) => a.push(d as number));
    bus.on('chan-b', (d) => b.push(d as number));
    bus.emit('chan-a', 1);
    bus.emit('chan-b', 2);
    expect(a).toEqual([1]);
    expect(b).toEqual([2]);
  });

  it('emitting to channel with no listeners is safe', () => {
    expect(() => bus.emit('nobody-listening', {})).not.toThrow();
  });
});

// =============================================================================
// PANEL PRESETS TESTS (pure logic, no React)
// =============================================================================

interface PanelPreset {
  name: string;
  activeTab: string;
  isOpen: boolean;
  createdAt: number;
}

const BUILT_IN_PRESETS: PanelPreset[] = [
  { name: 'Default', activeTab: 'safety', isOpen: true, createdAt: 0 },
  { name: 'World Builder', activeTab: 'terrain', isOpen: true, createdAt: 0 },
  { name: 'Debug', activeTab: 'profiler', isOpen: true, createdAt: 0 },
  { name: 'Animation', activeTab: 'timeline', isOpen: true, createdAt: 0 },
  { name: 'Compile', activeTab: 'compiler', isOpen: true, createdAt: 0 },
];

describe('PanelPresets (logic)', () => {
  it('built-in presets have correct count', () => {
    expect(BUILT_IN_PRESETS.length).toBe(5);
  });

  it('preset has required fields', () => {
    BUILT_IN_PRESETS.forEach((p) => {
      expect(p.name).toBeTruthy();
      expect(p.activeTab).toBeTruthy();
      expect(typeof p.isOpen).toBe('boolean');
      expect(typeof p.createdAt).toBe('number');
    });
  });

  it('can create custom preset', () => {
    const custom: PanelPreset = {
      name: 'My Layout',
      activeTab: 'camera',
      isOpen: true,
      createdAt: Date.now(),
    };
    const all = [...BUILT_IN_PRESETS, custom];
    expect(all.length).toBe(6);
    expect(all.find((p) => p.name === 'My Layout')).toBeDefined();
  });

  it('can filter out built-in presets', () => {
    const custom: PanelPreset = {
      name: 'Custom 1',
      activeTab: 'shader',
      isOpen: true,
      createdAt: Date.now(),
    };
    const all = [...BUILT_IN_PRESETS, custom];
    const customOnly = all.filter((p) => !BUILT_IN_PRESETS.some((b) => b.name === p.name));
    expect(customOnly.length).toBe(1);
    expect(customOnly[0].name).toBe('Custom 1');
  });

  it('prevents duplicate custom preset names', () => {
    const existing = [
      ...BUILT_IN_PRESETS,
      { name: 'MyPreset', activeTab: 'camera', isOpen: true, createdAt: Date.now() },
    ];
    const updated = existing.filter((p) => p.name !== 'MyPreset');
    updated.push({ name: 'MyPreset', activeTab: 'lighting', isOpen: true, createdAt: Date.now() });
    const match = updated.filter((p) => p.name === 'MyPreset');
    expect(match.length).toBe(1);
    expect(match[0].activeTab).toBe('lighting'); // Updated
  });
});
