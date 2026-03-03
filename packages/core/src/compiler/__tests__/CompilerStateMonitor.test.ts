/**
 * CompilerStateMonitor Test Suite
 *
 * Tests for memory budget management and OOM prevention
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CompilerStateMonitor,
  createCompilerStateMonitor,
  type MemoryAlert,
  type MemoryStats,
} from '../CompilerStateMonitor';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { IncrementalCompiler } from '../IncrementalCompiler';

describe('CompilerStateMonitor', () => {
  let monitor: CompilerStateMonitor;

  beforeEach(() => {
    monitor = createCompilerStateMonitor({
      enabled: false, // Disable automatic monitoring in tests
      monitoringInterval: 100, // Fast interval for tests
    });
  });

  afterEach(() => {
    monitor.dispose();
  });

  // ===========================================================================
  // BASIC FUNCTIONALITY
  // ===========================================================================

  describe('Basic Functionality', () => {
    it('should create monitor with default options', () => {
      const defaultMonitor = createCompilerStateMonitor();
      expect(defaultMonitor).toBeDefined();
      defaultMonitor.dispose();
    });

    it('should capture memory stats', () => {
      const stats = monitor.captureMemoryStats();
      expect(stats).toMatchObject({
        timestamp: expect.any(Number),
        heapUsed: expect.any(Number),
        heapTotal: expect.any(Number),
        external: expect.any(Number),
        rss: expect.any(Number),
        ramUtilization: expect.any(Number),
        astSizeBytes: expect.any(Number),
        astNodeCount: expect.any(Number),
        symbolTableSizeBytes: expect.any(Number),
        symbolTableEntryCount: expect.any(Number),
      });
    });

    it('should calculate RAM utilization correctly', () => {
      const stats = monitor.captureMemoryStats();
      expect(stats.ramUtilization).toBeGreaterThan(0);
      expect(stats.ramUtilization).toBeLessThan(1);
      expect(stats.ramUtilization).toBe(stats.heapUsed / stats.heapTotal);
    });
  });

  // ===========================================================================
  // AST SIZE TRACKING
  // ===========================================================================

  describe('AST Size Tracking', () => {
    it('should return zero size for null AST', () => {
      const stats = monitor.captureMemoryStats();
      expect(stats.astSizeBytes).toBe(0);
      expect(stats.astNodeCount).toBe(0);
    });

    it('should estimate AST size for simple composition', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'TestComposition',
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      const stats = monitor.captureMemoryStats();

      expect(stats.astNodeCount).toBeGreaterThan(0);
      expect(stats.astSizeBytes).toBeGreaterThan(0);
    });

    it('should estimate AST size for complex composition with objects', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'ComplexComposition',
        templates: [],
        objects: [
          {
            type: 'Object',
            name: 'Cube1',
            properties: [
              { type: 'Property', key: 'position', value: [0, 1, 0] },
              { type: 'Property', key: 'color', value: '#ff0000' },
            ],
            traits: ['@grabbable', '@collidable'],
          },
          {
            type: 'Object',
            name: 'Cube2',
            properties: [{ type: 'Property', key: 'position', value: [1, 1, 0] }],
            traits: ['@grabbable'],
          },
        ],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      const stats = monitor.captureMemoryStats();

      expect(stats.astNodeCount).toBeGreaterThan(10); // Multiple objects + properties
      expect(stats.astSizeBytes).toBeGreaterThan(1000); // Reasonable size estimate
    });

    it('should count AST nodes correctly', () => {
      const ast = {
        a: 1,
        b: {
          c: 2,
          d: {
            e: 3,
          },
        },
        f: [{ g: 4 }, { h: 5 }],
      };

      const count = monitor.countASTNodes(ast);
      expect(count).toBeGreaterThan(5); // At least 6 objects in tree
    });
  });

  // ===========================================================================
  // SYMBOL TABLE MANAGEMENT
  // ===========================================================================

  describe('Symbol Table Management', () => {
    it('should register and retrieve symbols', () => {
      monitor.registerSymbol('testSymbol', { type: 'variable', value: 42 });
      const symbol = monitor.getSymbol('testSymbol');
      expect(symbol).toEqual({ type: 'variable', value: 42 });
    });

    it('should estimate symbol table size', () => {
      monitor.registerSymbol('symbol1', { data: 'test' });
      monitor.registerSymbol('symbol2', { data: 'test2' });
      monitor.registerSymbol('symbol3', { data: 'test3' });

      const stats = monitor.captureMemoryStats();
      expect(stats.symbolTableEntryCount).toBe(3);
      expect(stats.symbolTableSizeBytes).toBeGreaterThan(0);
    });

    it('should prune unused symbols', () => {
      // Register symbols
      monitor.registerSymbol('used1', { data: 'test' });
      monitor.registerSymbol('used2', { data: 'test' });
      monitor.registerSymbol('unused1', { data: 'test' });
      monitor.registerSymbol('unused2', { data: 'test' });

      // Set AST that only references used1 and used2
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'used1',
        templates: [{ type: 'Template', name: 'used2', properties: [], traits: [] }],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);

      const beforeStats = monitor.captureMemoryStats();
      expect(beforeStats.symbolTableEntryCount).toBe(4);

      const pruneResult = monitor.pruneSymbolTable();

      expect(pruneResult.symbolsRemoved).toBe(2); // unused1, unused2
      expect(pruneResult.memoryFreedBytes).toBeGreaterThan(0);

      const afterStats = monitor.captureMemoryStats();
      expect(afterStats.symbolTableEntryCount).toBe(2); // only used1, used2
    });
  });

  // ===========================================================================
  // AST PRUNING
  // ===========================================================================

  describe('AST Pruning', () => {
    it('should prune source locations from AST', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'TestComposition',
        loc: {
          start: { line: 1, column: 1 },
          end: { line: 10, column: 1 },
        },
        templates: [],
        objects: [
          {
            type: 'Object',
            name: 'Cube',
            loc: {
              start: { line: 2, column: 1 },
              end: { line: 5, column: 1 },
            },
            properties: [],
            traits: [],
          },
        ],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      const beforeStats = monitor.captureMemoryStats();

      const pruneResult = monitor.pruneAST();

      expect(pruneResult.nodesRemoved).toBeGreaterThan(0);
      expect(pruneResult.memoryFreedBytes).toBeGreaterThan(0);

      const prunedAST = monitor.getAST();
      expect(prunedAST).toBeDefined();
      expect((prunedAST as any).loc).toBeUndefined();
      expect((prunedAST as any).objects[0].loc).toBeUndefined();
    });

    it('should not prune essential properties', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'TestComposition',
        loc: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } },
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      monitor.pruneAST();

      const prunedAST = monitor.getAST();
      expect(prunedAST).toBeDefined();
      expect(prunedAST!.type).toBe('Composition');
      expect(prunedAST!.name).toBe('TestComposition');
      expect(prunedAST!.objects).toBeDefined();
    });
  });

  // ===========================================================================
  // MEMORY ALERTS
  // ===========================================================================

  describe('Memory Alerts', () => {
    it('should emit alert when RAM threshold exceeded', () => {
      const alerts: MemoryAlert[] = [];
      const alertMonitor = createCompilerStateMonitor({
        enabled: false,
        thresholds: {
          ramUtilizationAlert: 0.01, // Very low threshold to trigger easily
          ramUtilizationCritical: 0.95,
          astNodeCountThreshold: 1000000,
          symbolTableThreshold: 100000,
        },
        onAlert: (alert: MemoryAlert) => {
          alerts.push(alert);
        },
      });

      alertMonitor.checkMemoryStatus();
      alertMonitor.dispose();

      expect(alerts.length).toBeGreaterThan(0);
      const ramAlert = alerts.find(a => a.type === 'ram_utilization');
      expect(ramAlert).toBeDefined();
      expect(ramAlert!.level).toMatch(/warning|critical/);
      expect(ramAlert!.message).toContain('RAM utilization');
    });

    it('should track alert history', () => {
      const alerts: MemoryAlert[] = [];
      const alertMonitor = createCompilerStateMonitor({
        enabled: false,
        thresholds: {
          ramUtilizationAlert: 0.01, // Very low to trigger
          ramUtilizationCritical: 0.95,
          astNodeCountThreshold: 1000000,
          symbolTableThreshold: 100000,
        },
        onAlert: (alert: MemoryAlert) => {
          alerts.push(alert);
        },
      });

      alertMonitor.checkMemoryStatus();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alertMonitor.getAlerts().length).toBeGreaterThan(0);

      alertMonitor.dispose();
    });

    it('should filter alerts by level', () => {
      const alertMonitor = createCompilerStateMonitor({
        enabled: false,
        thresholds: {
          ramUtilizationAlert: 0.01,
          ramUtilizationCritical: 0.95,
          astNodeCountThreshold: 1000000,
          symbolTableThreshold: 100000,
        },
      });

      alertMonitor.checkMemoryStatus();

      const warnings = alertMonitor.getAlertsByLevel('warning');
      const criticals = alertMonitor.getAlertsByLevel('critical');

      expect(warnings.every((a) => a.level === 'warning')).toBe(true);
      expect(criticals.every((a) => a.level === 'critical')).toBe(true);

      alertMonitor.dispose();
    });

    it('should clear alerts', () => {
      const alertMonitor = createCompilerStateMonitor({
        enabled: false,
        thresholds: {
          ramUtilizationAlert: 0.01,
          ramUtilizationCritical: 0.95,
          astNodeCountThreshold: 1000000,
          symbolTableThreshold: 100000,
        },
      });

      alertMonitor.checkMemoryStatus();
      expect(alertMonitor.getAlerts().length).toBeGreaterThan(0);

      alertMonitor.clearAlerts();
      expect(alertMonitor.getAlerts().length).toBe(0);

      alertMonitor.dispose();
    });
  });

  // ===========================================================================
  // MONITORING
  // ===========================================================================

  describe('Monitoring', () => {
    it('should start and stop monitoring', async () => {
      let checkCount = 0;
      const monitoringMonitor = createCompilerStateMonitor({
        enabled: false,
        monitoringInterval: 50, // Very fast for testing
        onAlert: () => {
          checkCount++;
        },
        thresholds: {
          ramUtilizationAlert: 0.01, // Trigger alerts
          ramUtilizationCritical: 0.95,
          astNodeCountThreshold: 1000000,
          symbolTableThreshold: 100000,
        },
      });

      monitoringMonitor.startMonitoring();

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          monitoringMonitor.stopMonitoring();
          expect(checkCount).toBeGreaterThan(0); // Should have checked at least once
          monitoringMonitor.dispose();
          resolve();
        }, 200); // Wait for 4 checks (50ms × 4 = 200ms)
      });
    });

    it('should detect heap growth', () => {
      // Create large objects to grow heap
      const largeArray: unknown[] = [];
      for (let i = 0; i < 10000; i++) {
        largeArray.push({ data: 'x'.repeat(100) });
      }

      monitor.checkMemoryStatus();

      // Grow heap more
      for (let i = 0; i < 10000; i++) {
        largeArray.push({ data: 'x'.repeat(100) });
      }

      monitor.checkMemoryStatus();
      monitor.checkMemoryStatus();
      monitor.checkMemoryStatus();
      monitor.checkMemoryStatus();

      const stats = monitor.getStats();
      expect(stats.statsHistory.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // INCREMENTAL COMPILATION INTEGRATION
  // ===========================================================================

  describe('Incremental Compilation Integration', () => {
    it('should set and use incremental compiler', () => {
      const incrementalCompiler = new IncrementalCompiler();
      monitor.setIncrementalCompiler(incrementalCompiler);

      // Should not throw
      expect(() => monitor.setIncrementalCompiler(incrementalCompiler)).not.toThrow();
    });

    it('should trigger incremental compilation on critical memory', () => {
      const incrementalCompiler = new IncrementalCompiler();
      const resetSpy = vi.spyOn(incrementalCompiler, 'reset');

      monitor.setIncrementalCompiler(incrementalCompiler);

      const ast: HoloComposition = {
        type: 'Composition',
        name: 'Test',
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);

      const criticalMonitor = createCompilerStateMonitor({
        enabled: false,
        autoIncrementalCompile: true,
        thresholds: {
          ramUtilizationAlert: 0.70,
          ramUtilizationCritical: 0.01, // Very low to trigger
          astNodeCountThreshold: 1000000,
          symbolTableThreshold: 100000,
        },
      });

      criticalMonitor.setIncrementalCompiler(incrementalCompiler);
      criticalMonitor.setAST(ast);
      criticalMonitor.checkMemoryStatus();

      // Should have triggered reset
      expect(resetSpy).toHaveBeenCalled();

      criticalMonitor.dispose();
    });
  });

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  describe('Statistics', () => {
    it('should track pruning statistics', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'Test',
        loc: { start: { line: 1, column: 1 }, end: { line: 10, column: 1 } },
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      monitor.pruneAST();

      const stats = monitor.getStats();
      expect(stats.totalPrunings).toBe(1);
      expect(stats.totalNodesRemoved).toBeGreaterThan(0);
      expect(stats.totalMemoryFreed).toBeGreaterThan(0);
    });

    it('should provide comprehensive statistics', () => {
      const stats = monitor.getStats();

      expect(stats).toMatchObject({
        uptime: expect.any(Number),
        totalPrunings: expect.any(Number),
        totalNodesRemoved: expect.any(Number),
        totalMemoryFreed: expect.any(Number),
        alertCounts: {
          info: expect.any(Number),
          warning: expect.any(Number),
          critical: expect.any(Number),
        },
        currentStats: expect.any(Object),
        statsHistory: expect.any(Array),
      });
    });

    it('should reset statistics', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'Test',
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      monitor.pruneAST();
      monitor.checkMemoryStatus();

      let stats = monitor.getStats();
      expect(stats.totalPrunings).toBeGreaterThan(0);

      monitor.resetStats();

      stats = monitor.getStats();
      expect(stats.totalPrunings).toBe(0);
      expect(stats.totalNodesRemoved).toBe(0);
      expect(stats.totalMemoryFreed).toBe(0);
    });
  });

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  describe('Lifecycle', () => {
    it('should dispose cleanly', () => {
      const disposeMonitor = createCompilerStateMonitor({ enabled: true });
      disposeMonitor.startMonitoring();

      expect(() => disposeMonitor.dispose()).not.toThrow();

      const stats = disposeMonitor.captureMemoryStats();
      expect(stats.astNodeCount).toBe(0); // AST cleared
      expect(stats.symbolTableEntryCount).toBe(0); // Symbol table cleared
    });

    it('should clear AST', () => {
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'Test',
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      expect(monitor.getAST()).toBeDefined();

      monitor.clearAST();
      expect(monitor.getAST()).toBeNull();
    });
  });

  // ===========================================================================
  // STRESS TESTING
  // ===========================================================================

  describe('Stress Testing', () => {
    it('should handle large AST without OOM', () => {
      // Create a large AST with many objects
      const largeAST: HoloComposition = {
        type: 'Composition',
        name: 'LargeComposition',
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      // Add 10,000 objects
      for (let i = 0; i < 10000; i++) {
        largeAST.objects.push({
          type: 'Object',
          name: `Object${i}`,
          properties: [
            { type: 'Property', key: 'position', value: [i, 0, 0] },
            { type: 'Property', key: 'color', value: `#${i.toString(16).padStart(6, '0')}` },
          ],
          traits: ['@grabbable'],
        });
      }

      expect(() => monitor.setAST(largeAST)).not.toThrow();

      const stats = monitor.captureMemoryStats();
      expect(stats.astNodeCount).toBeGreaterThan(10000);
      expect(stats.astSizeBytes).toBeGreaterThan(1000000); // >1MB

      // Should be able to prune without crashing
      expect(() => monitor.pruneAST()).not.toThrow();
    });

    it('should handle many symbol table entries', () => {
      // Add 50,000 symbols
      for (let i = 0; i < 50000; i++) {
        monitor.registerSymbol(`symbol${i}`, { data: `value${i}` });
      }

      const stats = monitor.captureMemoryStats();
      expect(stats.symbolTableEntryCount).toBe(50000);

      // Should be able to prune without crashing
      const ast: HoloComposition = {
        type: 'Composition',
        name: 'Test',
        templates: [],
        objects: [],
        spatialGroups: [],
        lights: [],
        imports: [],
        timelines: [],
        audio: [],
        zones: [],
        transitions: [],
        conditionals: [],
        iterators: [],
        npcs: [],
        quests: [],
        abilities: [],
        dialogues: [],
        stateMachines: [],
        achievements: [],
        talentTrees: [],
        shapes: [],
      };

      monitor.setAST(ast);
      expect(() => monitor.pruneSymbolTable()).not.toThrow();

      const afterStats = monitor.captureMemoryStats();
      expect(afterStats.symbolTableEntryCount).toBeLessThan(50000);
    });
  });
});
