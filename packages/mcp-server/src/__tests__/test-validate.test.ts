import { expect, test, vi } from 'vitest';
import { handleTool } from '../handlers';

vi.mock('@holoscript/llm-provider', () => {
  return {
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

test('debug generate_scene and validate', async () => {
  const scene = (await handleTool('generate_scene', {
    description: 'a game arena with physics and multiplayer',
    targetFormat: 'holo',
  })) as Record<string, unknown>;

  console.log('GENERATED SCENE:', JSON.stringify(scene.code));

  const validation = await handleTool('validate_holoscript', {
    code: scene.code as string,
  });

  console.log('VALIDATION RESULT:', JSON.stringify(validation, null, 2));
});
