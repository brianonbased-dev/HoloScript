import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  suggestTraits,
  generateObject,
  generateScene,
  generateWorldNative,
  generateWorldFromPrompt,
} from '../generators';

vi.mock('@holoscript/llm-provider', () => ({
  createProviderManager: vi.fn(() => ({
    getRegisteredProviders: () => ['bitnet'],
    getProvider: () => ({
      generateHoloScript: vi.fn(async (request: { prompt: string }) => {
        if (request.prompt.includes('single')) {
          return {
            code: 'composition "AICubeScene" {\n  template "CubeTemplate" {\n    @grabbable\n    geometry: "cube"\n    color: "#ff0000"\n  }\n\n  object "Cube" using "CubeTemplate" {\n    position: [0, 1, 0]\n  }\n}',
            provider: 'bitnet',
            detectedTraits: ['@grabbable'],
          };
        }

        return {
          code: 'composition "AIScene" {\n  environment {\n    skybox: "gradient"\n  }\n\n  object "Cube" {\n    position: [0, 1, 0]\n  }\n}',
          provider: 'bitnet',
          detectedTraits: [],
        };
      }),
    }),
  })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('suggestTraits', () => {
  describe('interaction keywords', () => {
    it('should suggest @grabbable for "grab" descriptions', () => {
      const result = suggestTraits('an object that can be grabbed');
      expect(result.traits).toContain('@grabbable');
      expect(result.reasoning['@grabbable']).toContain('grab');
    });

    it('should suggest @throwable and @grabbable for "throw" descriptions', () => {
      const result = suggestTraits('a ball you can throw');
      expect(result.traits).toContain('@throwable');
      expect(result.traits).toContain('@grabbable');
    });

    it('should suggest @clickable for click-based interactions', () => {
      const result = suggestTraits('a button to click');
      expect(result.traits).toContain('@clickable');
    });

    it('should suggest @pointable for point-based interactions', () => {
      const result = suggestTraits('something to point at');
      expect(result.traits).toContain('@pointable');
    });

    it('should suggest @hoverable for hover descriptions', () => {
      const result = suggestTraits('highlights when you hover over it');
      expect(result.traits).toContain('@hoverable');
    });

    it('should suggest @scalable for resize descriptions', () => {
      const result = suggestTraits('an object you can resize');
      expect(result.traits).toContain('@scalable');
    });
  });

  describe('physics keywords', () => {
    it('should suggest @physics and @collidable for physics descriptions', () => {
      const result = suggestTraits('a physics-enabled object');
      expect(result.traits).toContain('@physics');
      expect(result.traits).toContain('@collidable');
    });

    it('should suggest @gravity for falling objects', () => {
      const result = suggestTraits('a ball that falls with gravity');
      expect(result.traits).toContain('@gravity');
    });

    it('should auto-add @collidable when @physics is present', () => {
      // The "physics" keyword triggers both @physics and @collidable
      const result = suggestTraits('physics simulation');
      expect(result.traits).toContain('@physics');
      expect(result.traits).toContain('@collidable');
    });
  });

  describe('visual keywords', () => {
    it('should suggest @glowing for glow descriptions', () => {
      const result = suggestTraits('a glowing orb');
      expect(result.traits).toContain('@glowing');
    });

    it('should suggest @transparent for see-through objects', () => {
      const result = suggestTraits('a transparent window');
      expect(result.traits).toContain('@transparent');
    });

    it('should suggest @animated for animated objects', () => {
      const result = suggestTraits('an animated character that spins');
      expect(result.traits).toContain('@animated');
    });

    it('should suggest @billboard for camera-facing objects', () => {
      const result = suggestTraits('a billboard that always faces the camera');
      expect(result.traits).toContain('@billboard');
    });
  });

  describe('networking keywords', () => {
    it('should suggest @networked and @synced for multiplayer', () => {
      const result = suggestTraits('a multiplayer synced object');
      expect(result.traits).toContain('@networked');
      expect(result.traits).toContain('@synced');
    });

    it('should suggest @persistent for saved objects', () => {
      const result = suggestTraits('an object that persists between sessions');
      expect(result.traits).toContain('@persistent');
    });
  });

  describe('behavior keywords', () => {
    it('should suggest @stackable for stackable objects', () => {
      const result = suggestTraits('blocks that can stack');
      expect(result.traits).toContain('@stackable');
    });

    it('should suggest @equippable for wearable items', () => {
      const result = suggestTraits('a hat you can wear');
      expect(result.traits).toContain('@equippable');
    });

    it('should suggest @consumable for food/drink', () => {
      const result = suggestTraits('an apple you can eat');
      expect(result.traits).toContain('@consumable');
    });

    it('should suggest @destructible for breakable objects', () => {
      const result = suggestTraits('a vase that can break');
      expect(result.traits).toContain('@destructible');
    });
  });

  describe('audio keywords', () => {
    it('should suggest @spatial_audio for sound-emitting objects', () => {
      const result = suggestTraits('a speaker that plays sound');
      expect(result.traits).toContain('@spatial_audio');
    });

    it('should suggest @voice_activated for voice control', () => {
      const result = suggestTraits('responds to voice commands');
      expect(result.traits).toContain('@voice_activated');
    });
  });

  describe('default behavior', () => {
    it('should suggest @pointable as default for generic descriptions', () => {
      const result = suggestTraits('a simple object');
      expect(result.traits).toContain('@pointable');
      expect(result.reasoning['@pointable']).toContain('Default');
    });

    it('should include confidence score', () => {
      const result = suggestTraits('a grabbable throwable ball');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
    });
  });

  describe('context parameter', () => {
    it('should consider context in trait suggestions', () => {
      const result = suggestTraits('a simple cube', 'multiplayer game');
      expect(result.traits).toContain('@networked');
    });
  });
});

describe('generateObject', () => {
  describe('geometry detection', () => {
    it('should detect cube geometry', () => {
      const result = generateObject('a red cube');
      expect(result.geometry).toBe('cube');
    });

    it('should detect sphere from "ball" keyword', () => {
      const result = generateObject('a bouncing ball');
      expect(result.geometry).toBe('sphere');
    });

    it('should detect cylinder geometry', () => {
      const result = generateObject('a metal cylinder');
      expect(result.geometry).toBe('cylinder');
    });

    it('should detect torus from "ring" keyword', () => {
      const result = generateObject('a gold ring');
      expect(result.geometry).toBe('torus');
    });

    it('should detect plane from "floor" keyword', () => {
      const result = generateObject('a wooden floor');
      expect(result.geometry).toBe('plane');
    });

    it('should default to sphere for unknown geometry', () => {
      const result = generateObject('a mysterious object');
      expect(result.geometry).toBe('sphere');
    });
  });

  describe('color detection', () => {
    it('should detect red color', () => {
      const result = generateObject('a red cube');
      expect(result.code).toContain('#ff0000');
    });

    it('should detect blue color', () => {
      const result = generateObject('a blue sphere');
      expect(result.code).toContain('#0000ff');
    });

    it('should detect gold color', () => {
      const result = generateObject('a gold ring');
      expect(result.code).toContain('#ffd700');
    });

    it('should default to cyan for unknown colors', () => {
      const result = generateObject('a mysterious sphere');
      expect(result.code).toContain('#00ffff');
    });
  });

  describe('format options', () => {
    it('should generate hsplus format by default', () => {
      const result = generateObject('a cube');
      expect(result.format).toBe('hsplus');
      expect(result.code).toContain('composition');
    });

    it('should generate holo format when specified', () => {
      const result = generateObject('a cube', { format: 'holo' });
      expect(result.format).toBe('holo');
      expect(result.code).toContain('template');
    });

    it('should generate hs format when specified', () => {
      const result = generateObject('a cube', { format: 'hs' });
      expect(result.format).toBe('hs');
      expect(result.code).toContain('composition');
    });
  });

  describe('code structure', () => {
    it('should include template definition', () => {
      const result = generateObject('a red cube');
      expect(result.code).toContain('template');
    });

    it('should include object definition', () => {
      const result = generateObject('a red cube');
      expect(result.code).toContain('object');
    });

    it('should include position', () => {
      const result = generateObject('a cube');
      expect(result.code).toContain('position:');
    });

    it('should include traits in the code', () => {
      const result = generateObject('a grabbable throwable ball');
      expect(result.code).toContain('@grabbable');
      expect(result.code).toContain('@throwable');
    });

    it('should include docs when includeDocs is true', () => {
      const result = generateObject('TestCube', { includeDocs: true });
      expect(result.code).toContain('Generated from natural language');
    });
  });

  describe('trait integration', () => {
    it('should return traits array', () => {
      const result = generateObject('a glowing sphere with physics');
      expect(result.traits).toContain('@glowing');
      expect(result.traits).toContain('@physics');
    });
  });
});

describe('generateScene', () => {
  it('should generate a minimal scene', () => {
    const result = generateScene('a simple room', { style: 'minimal' });
    expect(result.code).toContain('composition');
  });

  it('should generate a detailed scene', () => {
    const result = generateScene('a forest', { style: 'detailed' });
    expect(result.code).toContain('composition');
    expect(result.code).toContain('environment');
  });

  it('should include requested features', () => {
    const result = generateScene('a game arena', { features: ['multiplayer', 'physics'] });
    expect(result.code).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// generateWorldNative — sovereign backend fallback + mock mode
// ---------------------------------------------------------------------------

describe('generateWorldNative', () => {
  const SOVEREIGN_URL_KEY = 'HOLOSCRIPT_SOVEREIGN_BASE_URL';
  const SOVEREIGN_MOCK_KEY = 'HOLOSCRIPT_SOVEREIGN_MOCK';

  beforeEach(() => {
    // Start each test with a clean sovereign env state
    delete process.env[SOVEREIGN_URL_KEY];
    delete process.env[SOVEREIGN_MOCK_KEY];
  });

  afterEach(() => {
    delete process.env[SOVEREIGN_URL_KEY];
    delete process.env[SOVEREIGN_MOCK_KEY];
    vi.restoreAllMocks();
  });

  it('falls back to text-LLM path when no sovereign URL is configured', async () => {
    // No env vars set — sovereign backend not configured.
    // Should succeed via PATH 2 (LLM) or PATH 3 (heuristic), never throw.
    const result = await generateWorldNative('a quiet forest clearing');
    expect(result).toBeDefined();
    expect(result.holoCode).toBeDefined();
    expect(result.holoCode).toMatch(/composition/i);
    // source must be one of the non-sovereign paths
    expect(['text-llm', 'heuristic']).toContain(result.source);
  });

  it('uses mock mode when HOLOSCRIPT_SOVEREIGN_MOCK=true (no live URL needed)', async () => {
    // Mock the Sovereign3DAdapter module import so tests are network-free.
    vi.doMock('@holoscript/core/world', () => ({
      Sovereign3DAdapter: class {
        constructor(opts: { mockMode?: boolean }) {
          if (!opts.mockMode) throw new Error('expected mockMode=true');
        }
        async generate(req: { prompt: string; format: string }) {
          return {
            generationId: 'mock_test_123',
            assetUrl: `https://mock.local/world.splat`,
            metadata: {
              format: req.format,
              bounds: [-20, 0, -20, 20, 12, 20],
              agentStart: [0, 0, 0] as [number, number, number],
              waypoints: [[0, 0, 0]] as [number, number, number][],
              generationMs: 5,
            },
          };
        }
      },
    }));

    process.env[SOVEREIGN_MOCK_KEY] = 'true';

    const result = await generateWorldNative('a moonlit desert');
    expect(result.source).toBe('sovereign-3d');
    expect(result.assetUrl).toBeDefined();
    expect(result.holoCode).toMatch(/world_asset/);
    expect(result.format).toBeDefined();

    vi.doUnmock('@holoscript/core/world');
  });

  it('falls back gracefully when sovereign backend is configured but offline', async () => {
    // Sovereign URL is explicitly set (non-default) but the service is offline.
    // The fetch will fail with a network error — generateWorldNative must catch
    // it and fall through to PATH 2/3 rather than propagating the exception.
    vi.doMock('@holoscript/core/world', () => ({
      Sovereign3DAdapter: class {
        constructor() {}
        async generate() {
          throw new Error('fetch failed');
        }
      },
    }));

    process.env[SOVEREIGN_URL_KEY] = 'wss://api.hololand.io';

    const result = await generateWorldNative('a floating sky island');
    // Must succeed — source is the fallback path, not sovereign-3d
    expect(result).toBeDefined();
    expect(result.holoCode).toBeDefined();
    expect(result.source).not.toBe('sovereign-3d');
    expect(['text-llm', 'heuristic']).toContain(result.source);

    vi.doUnmock('@holoscript/core/world');
  });

  it('does NOT swallow errors from mock mode (mock failures are code bugs)', async () => {
    vi.doMock('@holoscript/core/world', () => ({
      Sovereign3DAdapter: class {
        constructor() {}
        async generate() {
          throw new Error('mock internal error');
        }
      },
    }));

    process.env[SOVEREIGN_MOCK_KEY] = 'true';

    await expect(generateWorldNative('anything')).rejects.toThrow('mock internal error');

    vi.doUnmock('@holoscript/core/world');
  });

  it('returns valid holoCode composition root on heuristic path', async () => {
    // Ensure no sovereign env is set — forces PATH 3 if LLM is also unavailable.
    const result = await generateWorldNative('an ancient ruin surrounded by jungle');
    expect(result.holoCode).toBeDefined();
    expect(typeof result.holoCode).toBe('string');
    expect(result.holoCode.length).toBeGreaterThan(10);
  });
});

describe('generateWorldFromPrompt', () => {
  it('emits multimodal provenance, semantic nodes, and inline colliders', async () => {
    const result = await generateWorldFromPrompt('a warehouse robot training arena', {
      inputs: [
        { type: 'image', url: 'file:///scan.png' },
        { type: 'video', url: 'file:///scan.mp4' },
      ],
      videoReconstruction: {
        sessionId: 'sess-video',
        replayFingerprint: 'fp-video',
        framesIngested: 0,
        ingestMode: 'none',
        captureProfile: 'room',
      },
      generatedAt: '2026-06-21T00:00:00Z',
      interactiveMode: true,
      navEnabled: true,
    });

    expect(result.inputModalities).toEqual(['text', 'image', 'video']);
    expect(result.provenance.schema).toBe('cael.world_foundation_model.v1');
    expect(result.provenance.videoReconstructionSessionId).toBe('sess-video');
    expect(result.semanticNodes.some((node) => node.kind === 'video_reconstruction')).toBe(true);
    expect(result.colliderMeshes.length).toBeGreaterThanOrEqual(3);
    expect(result.holoCode).toContain('@world_foundation_model');
    expect(result.holoCode).toContain('@collider');
    expect(result.holoCode).toContain('VideoReconstructionBounds');
  });
});
