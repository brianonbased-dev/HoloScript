import { describe, it, expect, vi, afterEach } from 'vitest';

import * as generators from '../generators';
import { applyNativeAutoRigToGeneratedObject, handleTool } from '../handlers';
import type { SigningContext } from '../holomesh/identity/signing-middleware';

const mockSigningCtx: SigningContext = {
  signedRequest: false,
  signingValid: true,
  signer: null,
  scopes: ['admin:*'],
} as SigningContext;

describe('handlers AI generation path', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generate_scene returns ai metadata from mocked BitNet path', async () => {
    vi.spyOn(generators, 'generateSceneForMCP').mockResolvedValue({
      code: 'composition "AIScene" { environment { skybox: "gradient" } object "Cube" { position: [0,1,0] } }',
      stats: { objects: 1, traits: 0, lines: 8 },
      source: 'ai',
      provider: 'bitnet',
      attemptedProviders: ['bitnet'],
    } as Awaited<ReturnType<typeof generators.generateSceneForMCP>>);

    const result = (await handleTool(
      'generate_scene',
      {
        description: 'a small arena',
        features: ['logic'],
      },
      mockSigningCtx
    )) as {
      code: string;
      source: string;
      provider: string;
      stats: { lines: number };
    };

    expect(result.code).toContain('composition');
    expect(result.source).toBe('ai');
    expect(result.provider).toBe('bitnet');
    expect(result.stats.lines).toBeGreaterThan(0);
  });

  it('adds native auto-rig annotations and skeleton metadata to generated 3D objects', () => {
    const enriched = applyNativeAutoRigToGeneratedObject({
      holoCode: `composition "Hero" {
  object "Hero" @glowing {
    model: "hero.glb"
  }
}`,
      description: 'a stylized adventurer',
      provider: 'meshy',
      modelFilePath: 'C:\\tmp\\hero.glb',
      traits: ['glowing'],
      rig: 'humanoid',
      pose: 'a-pose',
    });

    expect(enriched.holoCode).toContain('@generated_mesh(model: "hero.glb"');
    expect(enriched.holoCode).toContain('@auto_rig(rig: "humanoid", pose: "a-pose"');
    expect(enriched.holoCode).toContain('@skeleton(rig: "humanoid", pose: "a-pose"');
    expect(enriched.traits).toEqual(['glowing', 'generated_mesh', 'auto_rig', 'skeleton']);
    expect(enriched.generatedMesh.topology).toBe('animation-compatible');
    expect(enriched.skeleton.standard).toBe('HoloScriptHumanoid21');
    expect(enriched.autoRig.humanoidMap?.rightFoot).toBe('right_foot');
  });
});
