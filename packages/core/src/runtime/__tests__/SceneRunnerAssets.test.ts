/**
 * SceneRunnerAssets Tests
 *
 * Tests the optional AssetPipeline integration added to SceneRunner:
 *  - preloadAssets(manifest) — parallel asset loading
 *  - runWithAssets(root, manifest) — preload then instantiate AST
 *  - Backward compatibility — no pipeline still works
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SceneRunner, type AssetManifestEntry } from '../SceneRunner';
import { AssetPipeline } from '../AssetPipeline';
import { World } from '../../ecs/World';
import { TraitBinder } from '../TraitBinder';
import { EventBus } from '../../events/EventBus';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── fixtures ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    type: 'mesh',
    name: 'testNode',
    id: 'n1',
    children: [],
    directives: [],
    properties: {},
    ...overrides,
  } as unknown as HSPlusNode;
}

function makeSceneRunner(pipeline?: AssetPipeline) {
  const world = new World();
  const traitBinder = new TraitBinder();
  const eventBus = new EventBus();
  const runner = new SceneRunner({ world, traitBinder, eventBus, assetPipeline: pipeline });
  return { runner, eventBus, world };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('SceneRunner + AssetPipeline integration', () => {

  // ── Backward compatibility ─────────────────────────────────────────────────

  it('works without an AssetPipeline (no-op preload)', async () => {
    const { runner } = makeSceneRunner(); // no pipeline
    await expect(runner.preloadAssets([{ type: 'texture', path: 'a.png' }])).resolves.toBeUndefined();
  });

  it('run() still works without a pipeline', () => {
    const { runner } = makeSceneRunner();
    const entity = runner.run(makeNode());
    expect(entity).toBeDefined();
    expect(runner.spawnedCount).toBe(1);
  });

  // ── AssetPipeline field exposure ──────────────────────────────────────────

  it('exposes assetPipeline when provided', () => {
    const pipeline = new AssetPipeline();
    const { runner } = makeSceneRunner(pipeline);
    expect(runner.assetPipeline).toBe(pipeline);
  });

  it('assetPipeline is undefined when not provided', () => {
    const { runner } = makeSceneRunner();
    expect(runner.assetPipeline).toBeUndefined();
  });

  // ── preloadAssets ──────────────────────────────────────────────────────────

  it('preloadAssets loads all manifest entries', async () => {
    const pipeline = new AssetPipeline();
    const loaded: string[] = [];
    pipeline.registerLoader('tex', async (path) => { loaded.push(path); return path; });

    const { runner } = makeSceneRunner(pipeline);
    const manifest: AssetManifestEntry[] = [
      { type: 'tex', path: 'a.png' },
      { type: 'tex', path: 'b.png' },
    ];
    await runner.preloadAssets(manifest);

    expect(loaded).toContain('a.png');
    expect(loaded).toContain('b.png');
    expect(pipeline.isLoaded('tex', 'a.png')).toBe(true);
    expect(pipeline.isLoaded('tex', 'b.png')).toBe(true);
  });

  it('preloadAssets is a no-op for empty manifest', async () => {
    const pipeline = new AssetPipeline();
    const loadFn = vi.fn(async () => 'data');
    pipeline.registerLoader('tex', loadFn);

    const { runner } = makeSceneRunner(pipeline);
    await runner.preloadAssets([]);
    expect(loadFn).not.toHaveBeenCalled();
  });

  it('preloadAssets caches — second call does not re-invoke loader', async () => {
    const pipeline = new AssetPipeline();
    let callCount = 0;
    pipeline.registerLoader('tex', async () => { callCount++; return 'img'; });

    const { runner } = makeSceneRunner(pipeline);
    await runner.preloadAssets([{ type: 'tex', path: 'logo.png' }]);
    await runner.preloadAssets([{ type: 'tex', path: 'logo.png' }]);
    expect(callCount).toBe(1);
  });

  it('preloadAssets rejects if a loader throws', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('bad', async () => { throw new Error('load failed'); });

    const { runner } = makeSceneRunner(pipeline);
    await expect(runner.preloadAssets([{ type: 'bad', path: 'x' }])).rejects.toThrow('load failed');
  });

  // ── runWithAssets ──────────────────────────────────────────────────────────

  it('runWithAssets preloads then instantiates the AST', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('mesh', async (path) => ({ vertices: [], path }));

    const { runner } = makeSceneRunner(pipeline);
    const entity = await runner.runWithAssets(makeNode(), [{ type: 'mesh', path: 'box.glb' }]);

    expect(entity).toBeDefined();
    expect(pipeline.isLoaded('mesh', 'box.glb')).toBe(true);
    expect(runner.spawnedCount).toBe(1);
  });

  it('runWithAssets emits scene:assets_loaded event', async () => {
    const pipeline = new AssetPipeline();
    pipeline.registerLoader('tex', async () => 'data');

    const { runner, eventBus } = makeSceneRunner(pipeline);
    const events: unknown[] = [];
    eventBus.on('scene:assets_loaded', (data) => events.push(data));

    await runner.runWithAssets(makeNode(), [
      { type: 'tex', path: 'sky.hdr' },
      { type: 'tex', path: 'ground.png' },
    ]);

    expect(events.length).toBe(1);
    expect((events[0] as any).count).toBe(2);
  });

  it('runWithAssets with empty manifest still runs the AST', async () => {
    const { runner } = makeSceneRunner(new AssetPipeline());
    const entity = await runner.runWithAssets(makeNode(), []);
    expect(entity).toBeDefined();
    expect(runner.spawnedCount).toBe(1);
  });
});
