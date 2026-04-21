import { describe, it, expect, vi, afterEach } from 'vitest';

import * as generators from '../generators';
import { handleTool } from '../handlers';

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

    const result = (await handleTool('generate_scene', {
      description: 'a small arena',
      features: ['logic'],
    })) as {
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
});
