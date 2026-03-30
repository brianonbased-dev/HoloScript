/**
 * End-to-End Grok Pipeline Test
 *
 * Validates the full MCP tool chain: generate_scene → validate → suggest_traits → create_share_link
 * with emphasis on social traits (@shareable, @collaborative, @tweetable).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleTool } from '../handlers';
import { suggestTraits } from '../generators';

// Mock LLM provider (same pattern as generators.test.ts)
vi.mock('@holoscript/llm-provider', () => ({
  createProviderManager: vi.fn(() => ({
    getRegisteredProviders: () => ['mock'],
    getProvider: () => ({
      generateHoloScript: vi.fn(async () => ({
        code: `composition "SocialScene" {
  environment {
    skybox: "gradient"
    ambient_light: 0.6
  }

  object "SharedArt" @shareable @collaborative {
    geometry: "sphere"
    color: "#ff4488"
    position: [0, 1.5, 0]
  }

  object "TweetCube" @tweetable @grabbable {
    geometry: "cube"
    color: "#1da1f2"
    position: [2, 1, 0]
  }
}`,
        provider: 'mock',
        detectedTraits: ['@shareable', '@collaborative', '@tweetable', '@grabbable'],
      })),
    }),
  })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('Grok E2E Pipeline', () => {
  describe('Step 1: generate_scene', () => {
    it('should generate a scene from natural language', async () => {
      const result = (await handleTool('generate_scene', {
        description: 'a shareable collaborative art gallery',
        style: 'detailed',
      })) as Record<string, unknown>;

      expect(result.code).toBeDefined();
      expect(typeof result.code).toBe('string');
      expect((result.code as string).length).toBeGreaterThan(0);
      expect(result.code as string).toContain('composition');
    });
  });

  describe('Step 2: validate_holoscript', () => {
    it('should validate well-formed code as valid', async () => {
      const code = `composition "Valid" {
  object "Cube" {
    geometry: "cube"
    color: "#ff0000"
  }
}`;
      const result = (await handleTool('validate_holoscript', {
        code,
      })) as Record<string, unknown>;

      expect(result.valid).toBe(true);
    });

    it('should detect errors in malformed code', async () => {
      const result = (await handleTool('validate_holoscript', {
        code: 'composition "Broken" { object "x" {',
      })) as Record<string, unknown>;

      expect(result.valid).toBe(false);
      expect((result.errors as unknown[]).length).toBeGreaterThan(0);
    });
  });

  describe('Step 3: suggest_traits for social scenarios', () => {
    it('should suggest @shareable for share-related descriptions', () => {
      const result = suggestTraits('an artwork that can be shared on social media');
      expect(result.traits).toContain('@shareable');
    });

    it('should suggest @tweetable for tweet-related descriptions', () => {
      const result = suggestTraits('a scene designed to tweet about');
      expect(result.traits).toContain('@tweetable');
    });

    it('should suggest @collaborative for collaboration descriptions', () => {
      const result = suggestTraits('a workspace where people collaborate');
      expect(result.traits).toContain('@collaborative');
    });
  });

  describe('Step 4: list_traits social category', () => {
    it('should return all 3 social traits', async () => {
      const result = (await handleTool('list_traits', {
        category: 'social',
      })) as Record<string, unknown>;

      expect(result.count).toBe(3);
      const traits = result.traits as string[];
      expect(traits).toContain('@shareable');
      expect(traits).toContain('@collaborative');
      expect(traits).toContain('@tweetable');
    });
  });

  describe('Step 5: create_share_link', () => {
    it('should create X-optimized share links', async () => {
      const code = `composition "Gallery" {
  object "Art" @shareable {
    geometry: "sphere"
    color: "#ff0000"
  }
}`;
      const result = (await handleTool('create_share_link', {
        code,
        title: 'My VR Gallery',
        description: 'Interactive 3D art',
        platform: 'x',
      })) as Record<string, unknown>;

      expect(result.playgroundUrl).toBeDefined();
      expect(typeof result.playgroundUrl).toBe('string');
      expect(result.embedUrl).toBeDefined();
      expect(result.tweetText).toBeDefined();
      expect(result.tweetText as string).toContain('My VR Gallery');
      expect(result.tweetText as string).toContain('#HoloScript');
      expect(result.qrCode).toBeDefined();
      expect(result.cardMeta).toBeDefined();
      expect((result.cardMeta as Record<string, string>)['twitter:card']).toBe('summary_large_image');
    }, 15000);
  });

  describe('Full chain: generate → validate → suggest → share', () => {
    it('should complete the full Grok pipeline without errors', async () => {
      // 1. Generate
      const scene = (await handleTool('generate_scene', {
        description: 'a game arena with physics and multiplayer',
        style: 'detailed',
      })) as Record<string, unknown>;
      expect(scene.code).toBeDefined();
      expect((scene.code as string).length).toBeGreaterThan(0);

      // 2. Validate
      const validation = (await handleTool('validate_holoscript', {
        code: scene.code as string,
      })) as Record<string, unknown>;
      expect(validation.valid).toBe(true);

      // 3. Suggest traits
      const suggestions = suggestTraits('a game arena with physics and multiplayer');
      expect(suggestions.traits.length).toBeGreaterThan(0);
      expect(suggestions.traits).toContain('@physics');
      expect(suggestions.traits).toContain('@networked');

      // 4. Share
      const shareResult = (await handleTool('create_share_link', {
        code: scene.code as string,
        title: 'Game Arena',
        platform: 'x',
      })) as Record<string, unknown>;
      expect(shareResult.playgroundUrl).toBeDefined();
      expect(shareResult.tweetText as string).toContain('Game Arena');
      expect(shareResult.qrCode).toBeDefined();
    }, 15000);
  });
});
