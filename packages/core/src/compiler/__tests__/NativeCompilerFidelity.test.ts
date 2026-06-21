import { describe, expect, it, vi } from 'vitest';
import { AndroidCompiler } from '../AndroidCompiler';
import { ExportManager } from '../ExportManager';
import { IOSCompiler } from '../IOSCompiler';
import { VisionOSCompiler } from '../VisionOSCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeNativeFidelityScene(): HoloComposition {
  return {
    name: 'NativeFidelityScene',
    objects: [
      {
        name: 'CubeOne',
        properties: [
          { key: 'mesh', value: 'cube' },
          { key: 'color', value: '#ff0000' },
          { key: 'position', value: [0, 0, 0] },
        ],
        traits: [],
      },
      {
        name: 'OrbTwo',
        properties: [
          { key: 'mesh', value: 'sphere' },
          { key: 'color', value: '#00ff00' },
          { key: 'position', value: [1, 0.5, -0.25] },
          { key: 'scale', value: [0.5, 0.5, 0.5] },
        ],
        traits: [],
      },
      {
        name: 'PanelThree',
        properties: [
          { key: 'mesh', value: 'plane' },
          { key: 'color', value: '#0000ff' },
          { key: 'position', value: [-1, 0, 0.25] },
        ],
        traits: [],
      },
    ],
  } as HoloComposition;
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

describe('native compiler fidelity verifiers', () => {
  it('Android emits a declarative SceneView node for every object', () => {
    const result = new AndroidCompiler().compile(makeNativeFidelityScene(), 'test-token');

    // SceneView dissolves the Sceneform NodeFactory + SceneState ViewModel; every object is a
    // declarative node placed directly in the Compose ARScene { }.
    expect(result.nodeFactoryFile).toBe('');
    expect(result.stateFile).toBe('');

    for (const name of ['CubeOne', 'OrbTwo', 'PanelThree']) {
      expect(result.activityFile).toContain(`// ${name} — geometry:`);
    }

    // One node per object: CubeOne (cube) + PanelThree (plane → cube default) = 2 CubeNode;
    // OrbTwo (sphere) = 1 SphereNode. No empty-scene placeholder when objects are present.
    expect(countMatches(result.activityFile, /CubeNode\(/g)).toBe(2);
    expect(countMatches(result.activityFile, /SphereNode\(/g)).toBe(1);
    expect(result.activityFile).not.toContain('default placeholder cube');

    // OrbTwo's spec flows through: position, radius-from-scale, and colour.
    expect(result.activityFile).toContain('Position(x = 1f, y = 0.5f, z = -0.25f)');
    expect(result.activityFile).toContain('radius = 0.5f');
    expect(result.activityFile).toContain('materialLoader.createColorInstance(Color(0xFF00FF00))');
  });

  it('iOS builds and places a deterministic scene node containing all objects', () => {
    const result = new IOSCompiler().compile(makeNativeFidelityScene(), 'test-token');

    for (const objectName of ['CubeOne', 'OrbTwo', 'PanelThree']) {
      expect(result.sceneFile).toContain(`nodes["${objectName}"] = make${objectName}()`);
    }

    expect(result.stateFile).toContain('for name in nodes.keys.sorted()');
    expect(result.stateFile).toContain('rootNode.addChildNode(node)');
    expect(result.stateFile).not.toContain('nodes.values.first');
  });

  it('visionOS adds one RealityKit entity for each input object', () => {
    const swift = new VisionOSCompiler().compile(makeNativeFidelityScene(), 'test-token');

    expect(countMatches(swift, /root\.addChild\((CubeOne|OrbTwo|PanelThree)\)/g)).toBe(3);
    expect(countMatches(swift, /ModelEntity\(mesh:/g)).toBeGreaterThanOrEqual(3);
  });

  it('keeps iOS reachable through the ExportManager target dispatch', async () => {
    const manager = new ExportManager({ useMemoryMonitoring: false });

    try {
      expect(manager.getSupportedTargets()).toContain('ios');
      const result = await manager.export('ios', makeNativeFidelityScene(), {
        agentToken: 'test-token',
        useFallback: false,
      });

      expect(result.success).toBe(true);
      expect((result.output as { sceneFile?: string }).sceneFile).toContain('makeCubeOne()');
    } finally {
      manager.dispose();
    }
  });
});
