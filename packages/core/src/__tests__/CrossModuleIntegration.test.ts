import { describe, it, expect, beforeEach } from 'vitest';

// Cross-module integration tests
import { PluginLoader, PluginState } from '../plugins/PluginLoader';
import { PluginAPI } from '../plugins/PluginAPI';
import { ModRegistry } from '../plugins/ModRegistry';
import { HierarchyPanel } from '../editor/HierarchyPanel';
import { PropertyGrid } from '../editor/PropertyGrid';
import { ToolManager } from '../editor/ToolManager';
import { LobbyManager } from '@holoscript/mesh';
import { Matchmaker } from '@holoscript/mesh';
import { AntiCheat } from '@holoscript/mesh';
import { SceneBundler } from '../build/SceneBundler';
import { PlatformExporter } from '../build/PlatformExporter';
import { BuildOptimizer } from '../build/BuildOptimizer';
import { HoloLogger } from '../logging/HoloLogger';
import { LoggerFactory } from '../logging/LoggerFactory';
import {
  LogMiddlewarePipeline,
  createContextEnricher,
  createLevelFilter,
} from '../logging/LogMiddleware';

describe('Cross-Module Integration (Cycle 173)', () => {
  // ===========================================================================
  // Plugin → Editor Integration
  // ===========================================================================
  describe('Plugin → Editor Integration', () => {
    it('should register a plugin-provided editor tool', () => {
      const pluginApi = new PluginAPI({
        pluginId: 'terrain-plugin',
        permissions: ['scene:read', 'scene:write'],
      });

      const toolManager = new ToolManager();

      // Plugin registers a custom sculpt tool
      pluginApi.registerCommand({
        id: 'terrain.sculpt',
        name: 'Terrain Sculpt',
        handler: () => {
          toolManager.registerTool({
            id: 'sculpt',
            name: 'Sculpt',
            category: 'sculpt',
            shortcut: 't',
          });
        },
      });

      pluginApi.executeCommand('terrain.sculpt');
      expect(toolManager.getToolCount()).toBe(1);
      expect(toolManager.getToolsByCategory('sculpt')).toHaveLength(1);
    });

    it('should populate hierarchy from plugin-registered entities', () => {
      const panel = new HierarchyPanel();
      const pluginApi = new PluginAPI({
        pluginId: 'level-plugin',
        permissions: ['scene:read', 'scene:write'],
      });

      // Simulate plugin adding entities to hierarchy
      const entities = [
        { id: 'tree_1', name: 'Oak Tree', type: 'entity' as const },
        { id: 'tree_2', name: 'Pine Tree', type: 'entity' as const },
      ];

      for (const e of entities) {
        panel.addNode({
          id: e.id,
          name: e.name,
          parentId: null,
          childIds: [],
          visible: true,
          locked: false,
          expanded: false,
          type: e.type,
        });
      }

      expect(panel.getCount()).toBe(2);
      expect(panel.filter({ query: 'oak' })).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Network → Anti-Cheat Integration
  // ===========================================================================
  describe('Network → Anti-Cheat Integration', () => {
    it('should validate player actions through anti-cheat in a lobby', () => {
      const lobby = new LobbyManager();
      const antiCheat = new AntiCheat({ maxSpeed: 10, maxTeleportDistance: 50, banThreshold: 3 });

      const room = lobby.createRoom('host', 'Host', { name: 'Game', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'p1', 'Player1');

      // Register all players with anti-cheat
      for (const player of room.players.values()) {
        antiCheat.registerPlayer(player.id);
      }

      expect(antiCheat.getPlayerIds()).toHaveLength(2);

      // Valid move
      const state = antiCheat.getPlayerState('p1')!;
      state.lastUpdateAt = Date.now() - 1000;
      const result = antiCheat.validatePositionUpdate('p1', { x: 5, y: 0, z: 0 });
      expect(result.valid).toBe(true);
    });

    it('should auto-kick cheaters from lobby', () => {
      const lobby = new LobbyManager();
      const antiCheat = new AntiCheat({ banThreshold: 2 });

      const room = lobby.createRoom('host', 'Host', { name: 'R', maxPlayers: 4 });
      lobby.joinRoom(room.id, 'cheater', 'Cheater');
      antiCheat.registerPlayer('cheater');

      // Generate violations
      antiCheat.validatePositionUpdate('cheater', { x: 9999, y: 0, z: 0 });
      const state = antiCheat.getPlayerState('cheater')!;
      state.position = { x: 0, y: 0, z: 0 };
      antiCheat.validatePositionUpdate('cheater', { x: 9999, y: 0, z: 0 });

      if (antiCheat.isBanned('cheater')) {
        lobby.leaveRoom('cheater');
      }

      expect(antiCheat.isBanned('cheater')).toBe(true);
      expect(room.players.has('cheater')).toBe(false);
    });
  });

  // ===========================================================================
  // Build → Logger Integration
  // ===========================================================================
  describe('Build → Logger Integration', () => {
    it('should log build pipeline steps', () => {
      const logger = new HoloLogger('build', 'debug');
      const bundler = new SceneBundler({ maxChunkSize: 10000 });

      bundler.addAsset({
        id: 'main',
        type: 'script',
        path: '/main.js',
        sizeBytes: 5000,
        references: ['tex'],
      });
      bundler.addAsset({
        id: 'tex',
        type: 'texture',
        path: '/tex.png',
        sizeBytes: 3000,
        references: [],
      });
      bundler.addEntryPoint('main');

      logger.build('Starting bundle', 'b1', 'collect');
      const manifest = bundler.bundle();
      logger.build(`Bundle complete: ${manifest.totalAssets} assets`, 'b1', 'done');
      logger.performance('Bundle time', 150);

      expect(logger.getEntries()).toHaveLength(3);
      expect(logger.getEntriesByLevel('info')).toHaveLength(3);
    });

    it('should optimize build output and log savings', () => {
      const logger = new HoloLogger('optimizer', 'debug');
      const optimizer = new BuildOptimizer({ enabledPasses: ['minify', 'compress'] });

      optimizer.addTarget('app.js', 'js', 500000);
      const result = optimizer.optimize();

      logger.info(`Optimized: ${result.savingsPercent}% savings`);
      logger.performance('Optimization pass', result.duration);

      expect(result.savingsPercent).toBeGreaterThan(0);
      expect(logger.getEntries()).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Logger + Middleware Pipeline
  // ===========================================================================
  describe('Logger + Middleware Pipeline', () => {
    it('should process logs through middleware pipeline', () => {
      const factory = new LoggerFactory();
      factory.setGlobalLevel('debug');
      const logger = factory.getLogger('app');

      const pipeline = new LogMiddlewarePipeline();
      pipeline.use(createLevelFilter('info'));
      pipeline.use(createContextEnricher({ env: 'production' }));

      logger.debug('should be filtered');
      logger.info('should pass');

      const entries = logger.getEntries();
      // Process through pipeline
      const results = entries.map((e) => pipeline.process(e)).filter(Boolean);
      expect(results).toHaveLength(1);
      expect(results[0]?.context?.env).toBe('production');
    });
  });

  // ===========================================================================
  // Full Plugin Lifecycle
  // ===========================================================================
  describe('Full Plugin Lifecycle', () => {
    it('should run complete plugin lifecycle with mod registry', async () => {
      const loader = new PluginLoader();
      const registry = new ModRegistry();

      // Register as mod
      const manifest = { id: 'mymod', name: 'My Mod', version: '1.0.0' };
      registry.register(manifest, { priority: 1, source: 'workshop' });

      // Validate
      const validation = registry.validate();
      expect(validation.valid).toBe(true);

      // Load into plugin system
      const lifecycleLog: string[] = [];
      loader.register(manifest, {
        onInit: () => lifecycleLog.push('init'),
        onStart: () => lifecycleLog.push('start'),
        onStop: () => lifecycleLog.push('stop'),
      });

      loader.resolveDependencies();
      await loader.initializeAll();
      await loader.startAll();
      await loader.stopAll();

      expect(lifecycleLog).toEqual(['init', 'start', 'stop']);
    });
  });

  // ===========================================================================
  // Multi-Platform Export
  // ===========================================================================
  describe('Multi-Platform Export', () => {
    it('should export to web and VR with different configs', () => {
      const exporter = new PlatformExporter();
      exporter.configure('web');
      exporter.configure('vr-quest');

      const results = exporter.exportAll();
      expect(results).toHaveLength(2);

      const web = results.find((r) => r.target === 'web')!;
      const vr = results.find((r) => r.target === 'vr-quest')!;

      expect(web.files.some((f) => f.path.includes('sw.js'))).toBe(true);
      expect(vr.files.some((f) => f.path.includes('polyfills.js'))).toBe(true);
    });
  });
});
