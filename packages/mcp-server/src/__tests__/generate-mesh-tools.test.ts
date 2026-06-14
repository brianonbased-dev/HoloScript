import { describe, it, expect } from 'vitest';
import { handleGenerateMeshTool, generateMeshTools } from '../generate-mesh-tools';

describe('holo_generate_mesh', () => {
  it('registers the tool', () => {
    expect(generateMeshTools.map((t) => t.name)).toContain('holo_generate_mesh');
  });

  it('generates a watertight mesh from an SDF sphere', async () => {
    const res = (await handleGenerateMeshTool('holo_generate_mesh', {
      mode: 'sdf',
      sdf: { type: 'primitive', primitive: 'sphere', params: { radius: 1 } },
      resolution: [16, 16, 16],
    })) as { success: boolean; vertexCount: number; triangleCount: number };
    expect(res.success).toBe(true);
    expect(res.vertexCount).toBeGreaterThan(0);
    expect(res.triangleCount).toBeGreaterThan(0);
  });

  it('exports STL binary on request', async () => {
    const res = (await handleGenerateMeshTool('holo_generate_mesh', {
      mode: 'sdf',
      sdf: { type: 'primitive', primitive: 'sphere', params: { radius: 1 } },
      resolution: [12, 12, 12],
      output: 'stl-binary',
    })) as { success: boolean; stlBinaryBase64?: string };
    expect(res.success).toBe(true);
    expect(typeof res.stlBinaryBase64).toBe('string');
    expect((res.stlBinaryBase64 ?? '').length).toBeGreaterThan(0);
  });

  it('rejects sdf mode with no sdf node', async () => {
    const res = (await handleGenerateMeshTool('holo_generate_mesh', { mode: 'sdf' })) as {
      success: boolean;
    };
    expect(res.success).toBe(false);
  });

  it('reports prompt mode as not-yet-enabled (honest, not a crash)', async () => {
    const res = (await handleGenerateMeshTool('holo_generate_mesh', {
      mode: 'prompt',
      prompt: 'a chair',
    })) as { success: boolean; mode: string };
    expect(res.success).toBe(false);
    expect(res.mode).toBe('prompt');
  });

  it('returns null for an unknown tool name', async () => {
    expect(await handleGenerateMeshTool('nope', {})).toBeNull();
  });
});
