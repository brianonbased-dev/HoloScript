import { describe, it, expect, beforeEach } from 'vitest';
import { OptimizationPass } from '../OptimizationPass';

// Minimal R3FNode mock
function makeNode(type: string, id: string, props: any = {}, children: any[] = []): any {
  return { type, id, props, children };
}

function makeScene(children: any[] = []): any {
  return makeNode('group', 'scene', {}, children);
}

describe('OptimizationPass', () => {
  it('constructs with platform defaults', () => {
    const pass = new OptimizationPass({ platform: 'mobile' });
    // Mobile budgets are much lower — a simple scene should get high score
    const report = pass.analyze(makeScene());
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.stats.totalNodes).toBe(1); // just the root
  });

  it('gathers basic scene stats', () => {
    const scene = makeScene([
      makeNode('mesh', 'box1', { hsType: 'box' }),
      makeNode('mesh', 'box2', { hsType: 'sphere' }),
      makeNode('pointLight', 'light1'),
    ]);
    const report = new OptimizationPass().analyze(scene);
    expect(report.stats.totalNodes).toBe(4);
    expect(report.stats.meshCount).toBe(2);
    expect(report.stats.lightCount).toBe(1);
  });

  it('estimates triangles from geometry types', () => {
    const scene = makeScene([
      makeNode('mesh', 'sphere1', { hsType: 'sphere' }),
      makeNode('mesh', 'box1', { hsType: 'box' }),
    ]);
    const report = new OptimizationPass().analyze(scene);
    expect(report.stats.estimatedTriangles).toBe(2048 + 12);
  });

  it('warns when lights exceed budget', () => {
    const lights = Array.from({ length: 20 }, (_, i) => makeNode('pointLight', `light${i}`));
    const scene = makeScene(lights);
    const report = new OptimizationPass({ lightBudget: 8 }).analyze(scene);
    const lightHints = report.hints.filter(h => h.message.includes('lights'));
    expect(lightHints.length).toBeGreaterThan(0);
  });

  it('warns when draw calls exceed budget', () => {
    const meshes = Array.from({ length: 400 }, (_, i) => makeNode('mesh', `m${i}`, { hsType: 'box' }));
    const scene = makeScene(meshes);
    const report = new OptimizationPass({ drawCallBudget: 200 }).analyze(scene);
    const dcHints = report.hints.filter(h => h.category === 'drawcalls');
    expect(dcHints.length).toBeGreaterThan(0);
  });

  it('detects LOD opportunities for high-poly objects', () => {
    const scene = makeScene([
      makeNode('mesh', 'sphere1', { hsType: 'sphere' }), // 2048 tris → LOD candidate
      makeNode('mesh', 'box1', { hsType: 'box' }),       // 12 tris → not a candidate
    ]);
    const report = new OptimizationPass({ analyzeLOD: true }).analyze(scene);
    expect(report.lodRecommendations.length).toBe(1);
    expect(report.lodRecommendations[0].nodeId).toBe('sphere1');
  });

  it('detects batching opportunities', () => {
    const matProps = { color: 'red' };
    const scene = makeScene([
      makeNode('mesh', 'a', { hsType: 'box', materialProps: matProps }),
      makeNode('mesh', 'b', { hsType: 'box', materialProps: matProps }),
      makeNode('mesh', 'c', { hsType: 'box', materialProps: matProps }),
      makeNode('mesh', 'd', { hsType: 'box', materialProps: matProps }),
    ]);
    const report = new OptimizationPass({ analyzeBatching: true }).analyze(scene);
    expect(report.batchGroups.length).toBeGreaterThan(0);
    expect(report.batchGroups[0].canInstance).toBe(true);
  });

  it('tracks shadow casters', () => {
    const scene = makeScene([
      makeNode('mesh', 'a', { castShadow: true }),
      makeNode('mesh', 'b', { castShadow: true }),
      makeNode('mesh', 'c', { castShadow: true }),
    ]);
    const report = new OptimizationPass().analyze(scene);
    expect(report.stats.shadowCasterCount).toBe(3);
  });

  it('tracks transparent objects', () => {
    const scene = makeScene([
      makeNode('mesh', 'a', { materialProps: { transparent: true } }),
      makeNode('mesh', 'b', { materialProps: { opacity: 0.5 } }),
    ]);
    const report = new OptimizationPass().analyze(scene);
    expect(report.stats.transparentCount).toBe(2);
  });

  it('calculates VRAM for textures', () => {
    const scene = makeScene([
      makeNode('mesh', 'a', { materialProps: { map: 'tex.png', normalMap: 'n.png' } }),
    ]);
    const report = new OptimizationPass().analyze(scene);
    // 2 textures × 4MB each + 32MB base = 40MB
    expect(report.stats.estimatedVRAM_MB).toBe(40);
  });

  it('score decreases with critical issues', () => {
    const clean = new OptimizationPass().analyze(makeScene());
    const meshes = Array.from({ length: 500 }, (_, i) => makeNode('mesh', `m${i}`, { hsType: 'box' }));
    const heavy = new OptimizationPass({ drawCallBudget: 100 }).analyze(makeScene(meshes));
    expect(heavy.score).toBeLessThan(clean.score);
  });

  it('counts gltfModel draw calls and triangles', () => {
    const scene = makeScene([makeNode('gltfModel', 'model1')]);
    const report = new OptimizationPass().analyze(scene);
    expect(report.stats.estimatedDrawCalls).toBe(5);
    expect(report.stats.estimatedTriangles).toBe(5000);
  });

  it('warns about transparent objects on VR platform', () => {
    const tMeshes = Array.from({ length: 5 }, (_, i) =>
      makeNode('mesh', `t${i}`, { materialProps: { transparent: true } })
    );
    const scene = makeScene(tMeshes);
    const report = new OptimizationPass({ platform: 'vr' }).analyze(scene);
    const overdraw = report.hints.filter(h => h.category === 'overdraw');
    expect(overdraw.length).toBeGreaterThan(0);
  });

  it('warns about physics jitter (animated + rigidBody)', () => {
    const scene = makeScene([
      makeNode('mesh', 'jitter', { animated: true, rigidBody: true }),
    ]);
    const report = new OptimizationPass().analyze(scene);
    const physics = report.hints.filter(h => h.category === 'physics' && h.message.includes('jitter'));
    expect(physics.length).toBe(1);
  });
});
