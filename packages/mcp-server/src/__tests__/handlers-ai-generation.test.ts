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

  it('generate_scene reaches the handler for an unsigned consumer session', async () => {
    vi.spyOn(generators, 'generateSceneForMCP').mockResolvedValue({
      code: 'composition "ConsumerCabin" { object "Cabin" { position: [0,0,0] } }',
      stats: { objects: 1, traits: 0, lines: 4 },
      source: 'ai',
      provider: 'mock',
      attemptedProviders: ['mock'],
    } as Awaited<ReturnType<typeof generators.generateSceneForMCP>>);

    const originalDisabled = process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
    try {
      delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
      const result = (await handleTool(
        'generate_scene',
        { description: 'a small cabin' },
        undefined,
        'consumer'
      )) as {
        code?: string;
        success?: boolean;
        error?: string;
        provider?: string;
      };

      expect(result.success).not.toBe(false);
      expect(result.error).toBeUndefined();
      expect(result.code).toContain('ConsumerCabin');
      expect(result.provider).toBe('mock');
    } finally {
      if (originalDisabled === undefined) delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
      else process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED = originalDisabled;
    }
  });

  it('does not inherit stdio-local admin bypass for consumer-source requests', async () => {
    const generateSpy = vi.spyOn(generators, 'generateSceneForMCP').mockResolvedValue({
      code: 'composition "ShouldNotRun" {}',
      stats: { objects: 0, traits: 0, lines: 1 },
      source: 'ai',
      provider: 'mock',
      attemptedProviders: ['mock'],
    } as Awaited<ReturnType<typeof generators.generateSceneForMCP>>);

    const originalDisabled = process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
    const originalApiKey = process.env.HOLOSCRIPT_API_KEY;
    try {
      process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED = 'true';
      process.env.HOLOSCRIPT_API_KEY = 'server-env-key-present';
      const result = (await handleTool(
        'generate_scene',
        { description: 'a small cabin' },
        undefined,
        'consumer'
      )) as {
        success?: boolean;
        error?: string;
        policyId?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('ForkSandboxGate denied tool "generate_scene"');
      expect(result.policyId).toBe('holoscript-sensitive-default-v1');
      expect(generateSpy).not.toHaveBeenCalled();
    } finally {
      if (originalDisabled === undefined) delete process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED;
      else process.env.HOLOSCRIPT_CONSUMER_TIER_DISABLED = originalDisabled;
      if (originalApiKey === undefined) delete process.env.HOLOSCRIPT_API_KEY;
      else process.env.HOLOSCRIPT_API_KEY = originalApiKey;
    }
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
