import { describe, it, expect, beforeEach } from 'vitest';
import { EntityInspector } from '../debug/EntityInspector';
import { PerformanceOverlay } from '../debug/PerformanceOverlay';
import { DebugConsole } from '../debug/DebugConsole';

describe('Runtime Debugging (Cycle 178)', () => {
  describe('EntityInspector', () => {
    let inspector: EntityInspector;

    beforeEach(() => {
      inspector = new EntityInspector();
      inspector.registerEntity({
        id: 'e1',
        name: 'Player',
        tags: ['actor', 'controlled'],
        active: true,
        parentId: null,
        components: new Map([
          ['transform', { x: 0, y: 0 }],
          ['health', { hp: 100 }],
        ]),
      });
      inspector.registerEntity({
        id: 'e2',
        name: 'Enemy',
        tags: ['actor', 'ai'],
        active: true,
        parentId: null,
        components: new Map([['transform', { x: 10, y: 0 }]]),
      });
    });

    it('should register and count entities', () => {
      expect(inspector.getEntityCount()).toBe(2);
    });

    it('should select and get entity', () => {
      inspector.select('e1');
      expect(inspector.getSelected()?.name).toBe('Player');
    });

    it('should filter by name', () => {
      const result = inspector.filter({ nameQuery: 'play' });
      expect(result).toHaveLength(1);
    });

    it('should filter by tag', () => {
      const result = inspector.filter({ tag: 'ai' });
      expect(result).toHaveLength(1);
    });

    it('should filter by component type', () => {
      const result = inspector.filter({ componentType: 'health' });
      expect(result).toHaveLength(1);
    });

    it('should edit properties', () => {
      inspector.setProperty('e1', 'health', 'hp', 50);
      expect(inspector.getComponent('e1', 'health')?.hp).toBe(50);
    });
  });

  describe('PerformanceOverlay', () => {
    let overlay: PerformanceOverlay;

    beforeEach(() => {
      overlay = new PerformanceOverlay({ targetFPS: 60 });
    });

    it('should record frame samples', () => {
      overlay.recordFrame(16.67, 100, 50000, 256);
      overlay.recordFrame(16.67, 105, 51000, 257);
      expect(overlay.getSampleCount()).toBe(2);
    });

    it('should compute average FPS', () => {
      for (let i = 0; i < 10; i++) overlay.recordFrame(16.67, 100, 50000, 256);
      expect(overlay.getAverageFPS()).toBeCloseTo(60, 0);
    });

    it('should detect below-target FPS', () => {
      for (let i = 0; i < 10; i++) overlay.recordFrame(33.33, 100, 50000, 256);
      expect(overlay.isBelowTarget()).toBe(true);
    });

    it('should provide frame graph data', () => {
      overlay.recordFrame(16, 100, 50000, 256);
      overlay.recordFrame(17, 100, 50000, 256);
      const graph = overlay.getFrameGraph(2);
      expect(graph).toHaveLength(2);
    });

    it('should toggle visibility', () => {
      expect(overlay.isVisible()).toBe(true);
      overlay.toggle();
      expect(overlay.isVisible()).toBe(false);
    });
  });

  describe('DebugConsole', () => {
    let console: DebugConsole;

    beforeEach(() => {
      console = new DebugConsole();
    });

    it('should have builtin commands', () => {
      expect(console.getCommandCount()).toBeGreaterThanOrEqual(3);
    });

    it('should execute help command', () => {
      const result = console.execute('help');
      expect(result).toContain('help');
      expect(result).toContain('clear');
    });

    it('should register and execute custom commands', () => {
      console.registerCommand({ name: 'ping', description: 'Pong!', handler: () => 'pong' });
      expect(console.execute('ping')).toBe('pong');
    });

    it('should handle unknown commands', () => {
      const result = console.execute('nonexistent');
      expect(result).toContain('Unknown command');
    });

    it('should autocomplete commands', () => {
      const matches = console.autocomplete('he');
      expect(matches).toContain('help');
    });

    it('should navigate command history', () => {
      console.execute('help');
      console.execute('clear');
      expect(console.historyUp()).toBe('clear');
      expect(console.historyUp()).toBe('help');
    });

    it('should watch variables', () => {
      let counter = 42;
      console.watchVariable('counter', () => counter);
      const values = console.getWatchedValues();
      expect(values.counter).toBe(42);
    });
  });
});
