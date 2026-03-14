import { describe, it, expect, vi } from 'vitest';

vi.mock('../generators', () => ({
  suggestTraits: vi.fn(() => ({
    traits: ['@grabbable'],
    reasoning: { '@grabbable': 'mocked' },
    confidence: 0.9,
  })),
  generateObjectForMCP: vi.fn(async () => ({
    code: 'composition "AIObject" { object "Cube" { position: [0,1,0] } }',
    traits: ['@grabbable'],
    geometry: 'cube',
    format: 'hsplus',
    source: 'ai',
    provider: 'bitnet',
    attemptedProviders: ['bitnet'],
  })),
  generateObject: vi.fn(async () => ({
    code: 'composition "AIObject" { object "Cube" { position: [0,1,0] } }',
    traits: ['@grabbable'],
    geometry: 'cube',
    format: 'hsplus',
    source: 'ai',
    provider: 'bitnet',
    attemptedProviders: ['bitnet'],
  })),
  generateSceneForMCP: vi.fn(async () => ({
    code: 'composition "AIScene" { environment { skybox: "gradient" } object "Cube" { position: [0,1,0] } }',
    stats: { objects: 1, traits: 0, lines: 1 },
    source: 'ai',
    provider: 'bitnet',
    attemptedProviders: ['bitnet'],
  })),
  generateScene: vi.fn(async () => ({
    code: 'composition "AIScene" { environment { skybox: "gradient" } object "Cube" { position: [0,1,0] } }',
    stats: { objects: 1, traits: 0, lines: 1 },
    source: 'ai',
    provider: 'bitnet',
    attemptedProviders: ['bitnet'],
  })),
}));

describe('handlers AI generation path', () => {
  it('generate_scene returns ai metadata from mocked BitNet path', async () => {
    const handlers = await import('../handlers');

    const result = (await handlers.handleTool('generate_scene', {
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
  }, 60000);
});
