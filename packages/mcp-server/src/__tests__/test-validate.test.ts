import { expect, test, vi } from 'vitest';
import { handleTool } from '../handlers';

// Mock the LLM provider factory only; keep the module's other exports real.
// ollama-client (loaded through handlers) reads LOCAL_DEFAULT_MODEL at import
// time since 8e43e5d4e4, so a factory-only mock stopped this file from loading.
vi.mock('@holoscript/llm-provider', async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import('@holoscript/llm-provider')>()),
    createProviderManager: vi.fn(() => ({
      getRegisteredProviders: () => ['mock'],
      getProvider: () => ({
        generateHoloScript: vi.fn(async () => ({
          code: [
            'composition "SocialScene" {',
            '  environment {',
            '    skybox: "gradient"',
            '    ambient_light: 0.6',
            '  }',
            '',
            '  object "SharedArt" @shareable @collaborative {',
            '    geometry: "sphere"',
            '    color: "#ff4488"',
            '    position: [0, 1.5, 0]',
            '  }',
            '',
            '  object "TweetCube" @tweetable @grabbable {',
            '    geometry: "cube"',
            '    color: "#1da1f2"',
            '    position: [2, 1, 0]',
            '  }',
            '}',
          ].join('\n'),
          provider: 'mock',
          detectedTraits: ['@shareable', '@collaborative', '@tweetable', '@grabbable'],
        })),
      }),
    })),
  };
});

// This began as a debug harness that printed both results for a person to read.
// What that person was checking is now asserted: the scene generate_scene hands
// back is one validate_holoscript accepts.
test('debug generate_scene and validate', async () => {
  const scene = (await handleTool('generate_scene', {
    description: 'a game arena with physics and multiplayer',
    targetFormat: 'holo',
  })) as Record<string, unknown>;

  expect(typeof scene.code).toBe('string');
  expect(scene.code as string).toMatch(/^composition\s+"/);

  const validation = (await handleTool('validate_holoscript', {
    code: scene.code as string,
  })) as { valid?: boolean; errors?: unknown[] };

  expect(validation.errors).toEqual([]);
  expect(validation.valid).toBe(true);
});
