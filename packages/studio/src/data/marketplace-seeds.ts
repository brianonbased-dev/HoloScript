/**
 * @fileoverview Marketplace seed data — starter packages for browsing
 *
 * Provide initial content for the marketplace so it's not empty
 * when users first open the Store panel.
 */

import { MarketplaceRegistry } from '@holoscript/core';

type MarketplacePackage = any;
type Publisher = any;
type MarketplaceSubmissionType = any;

// ═══════════════════════════════════════════════════════════════════

const HOLOSCRIPT_TEAM: Publisher = {
  id: 'pub-holoscript',
  name: 'HoloScript Team',
  did: 'did:key:z6MkHoloTeam',
  verified: true,
  trustLevel: 'trusted',
};

const COMMUNITY: Publisher = {
  id: 'pub-community',
  name: 'Community',
  did: 'did:key:z6MkCommunity',
  verified: true,
  trustLevel: 'trusted',
};

function v(major: number, minor: number, patch: number) {
  return { major, minor, patch };
}

const SEED_PACKAGES: MarketplacePackage[] = [
  // ── Worlds ──────────────────────────────────────────────────────
  {
    metadata: {
      id: '@holoscript/zen-garden',
      name: 'Zen Garden',
      description:
        'A tranquil Japanese garden with koi pond, cherry blossoms, and ambient soundscapes. Perfect for meditation and relaxation.',
      category: 'world',
      version: v(1, 0, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['meditation', 'nature', 'ambient', 'relaxation'],
      platforms: ['quest3', 'pcvr', 'visionos', 'webxr'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-01-15T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Garden',
        traits: ['@mesh', '@spatial_audio', '@ambient'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play'],
      },
    ],
    assets: [{ path: 'garden.glb', sizeBytes: 2_000_000, hash: 'zen001' }],
    bundleSizeBytes: 3_000_000,
  },
  {
    metadata: {
      id: '@holoscript/neon-arcade',
      name: 'Neon Arcade',
      description:
        'Retro-futuristic arcade with playable cabinet games, neon lighting, and synthwave audio. Multiplayer-ready.',
      category: 'world',
      version: v(2, 1, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['arcade', 'retro', 'multiplayer', 'neon'],
      platforms: ['quest3', 'pcvr', 'webxr'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-02-01T00:00:00Z',
      updatedAt: '2026-03-05T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Arcade',
        traits: ['@mesh', '@physics', '@multiplayer'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play', 'network:sync'],
      },
    ],
    assets: [{ path: 'arcade.glb', sizeBytes: 5_000_000, hash: 'neon001' }],
    bundleSizeBytes: 6_000_000,
  },
  // ── Agents ──────────────────────────────────────────────────────
  {
    metadata: {
      id: '@holoscript/guide-bot',
      name: 'Guide Bot',
      description:
        'Friendly AI guide that tours visitors through your world. Responds to voice commands, remembers preferences, and adapts to cultural norms.',
      category: 'agent',
      version: v(1, 2, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['ai', 'guide', 'voice', 'culture'],
      platforms: ['quest3', 'pcvr', 'visionos', 'webxr', 'ios', 'android'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-01-20T00:00:00Z',
      updatedAt: '2026-03-04T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'GuideBot',
        traits: ['@mesh', '@behavior_tree', '@voice_input', '@cultural_memory'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play', 'ai:inference'],
      },
    ],
    assets: [{ path: 'guide.glb', sizeBytes: 800_000, hash: 'guide001' }],
    bundleSizeBytes: 1_200_000,
  },
  {
    metadata: {
      id: '@community/merchant-npc',
      name: 'Merchant NPC',
      description:
        'Shopkeeper NPC with inventory management, bartering dialogue, and fair_trade norm compliance.',
      category: 'agent',
      version: v(1, 0, 0),
      publisher: COMMUNITY,
      tags: ['npc', 'merchant', 'economy', 'dialogue'],
      platforms: ['quest3', 'pcvr', 'webxr'],
      license: 'Apache-2.0',
      dependencies: [],
      createdAt: '2026-02-10T00:00:00Z',
      updatedAt: '2026-02-28T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Merchant',
        traits: ['@mesh', '@dialogue', '@norm_compliant'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play'],
      },
    ],
    assets: [{ path: 'merchant.glb', sizeBytes: 600_000, hash: 'merch001' }],
    bundleSizeBytes: 900_000,
  },
  // ── Objects ─────────────────────────────────────────────────────
  {
    metadata: {
      id: '@holoscript/physics-toybox',
      name: 'Physics Toybox',
      description:
        'Collection of 20 physics-enabled toys: balls, blocks, ramps, pendulums, dominoes. All @grabbable and @throwable.',
      category: 'object',
      version: v(1, 5, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['physics', 'toys', 'interactive', 'education'],
      platforms: ['quest3', 'pcvr', 'visionos', 'android-xr', 'webxr'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-02-20T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Toybox',
        traits: ['@mesh', '@physics', '@grabbable', '@throwable'],
        calls: [],
        declaredEffects: ['render:spawn', 'physics:force', 'physics:collision'],
      },
    ],
    assets: [{ path: 'toybox.glb', sizeBytes: 1_500_000, hash: 'toys001' }],
    bundleSizeBytes: 2_000_000,
  },
  // ── Traits ──────────────────────────────────────────────────────
  {
    metadata: {
      id: '@community/weather-system',
      name: 'Weather System',
      description:
        'Dynamic weather trait: rain, snow, fog, thunderstorms with particle effects and ambient audio.',
      category: 'trait',
      version: v(2, 0, 0),
      publisher: COMMUNITY,
      tags: ['weather', 'particles', 'ambient', 'environment'],
      platforms: ['quest3', 'pcvr', 'visionos', 'webxr'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-02-05T00:00:00Z',
      updatedAt: '2026-03-02T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Weather',
        traits: ['@particles', '@spatial_audio'],
        calls: [],
        declaredEffects: ['render:spawn', 'audio:play', 'resource:gpu'],
      },
    ],
    assets: [],
    bundleSizeBytes: 200_000,
  },
  // ── Shaders ─────────────────────────────────────────────────────
  {
    metadata: {
      id: '@holoscript/toon-shader-pack',
      name: 'Toon Shader Pack',
      description: '6 cel-shading styles: anime, comic, watercolor, pastel, neon-outline, woodcut.',
      category: 'shader',
      version: v(1, 0, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['toon', 'cel', 'shader', 'stylized'],
      platforms: ['quest3', 'pcvr', 'visionos', 'webxr', 'web'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-02-15T00:00:00Z',
      updatedAt: '2026-02-28T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'ToonShader',
        traits: ['@shader'],
        calls: [],
        declaredEffects: ['render:material'],
      },
    ],
    assets: [],
    bundleSizeBytes: 100_000,
  },
  // ── VFX ─────────────────────────────────────────────────────────
  {
    metadata: {
      id: '@community/magic-effects',
      name: 'Magic Effects Pack',
      description:
        '15 spell effects: fireballs, lightning, shields, healing auras, teleport particles.',
      category: 'vfx',
      version: v(1, 3, 0),
      publisher: COMMUNITY,
      tags: ['magic', 'particles', 'combat', 'fantasy'],
      platforms: ['quest3', 'pcvr', 'webxr'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-01-25T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'MagicVFX',
        traits: ['@particles', '@gpu_particles'],
        calls: [],
        declaredEffects: ['render:spawn', 'resource:gpu'],
      },
    ],
    assets: [{ path: 'magic_textures.bin', sizeBytes: 500_000, hash: 'magic001' }],
    bundleSizeBytes: 700_000,
  },
  // ── Templates ───────────────────────────────────────────────────
  {
    metadata: {
      id: '@holoscript/starter-world',
      name: 'Starter World Template',
      description:
        'Minimal world template with sky, ground, lighting, and a spawn point. The Hello World of HoloScript.',
      category: 'template',
      version: v(1, 0, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['starter', 'template', 'beginner', 'tutorial'],
      platforms: ['quest3', 'pcvr', 'visionos', 'android-xr', 'webxr', 'web'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'StarterWorld',
        traits: ['@mesh'],
        calls: [],
        declaredEffects: ['render:spawn'],
      },
    ],
    assets: [],
    bundleSizeBytes: 50_000,
  },
  // ── Plugins ─────────────────────────────────────────────────────
  {
    metadata: {
      id: '@holoscript/analytics-plugin',
      name: 'World Analytics',
      description:
        'Track visitor count, dwell time, popular zones, and agent interactions. Dashboard + export to CSV.',
      category: 'plugin',
      version: v(1, 1, 0),
      publisher: HOLOSCRIPT_TEAM,
      tags: ['analytics', 'metrics', 'dashboard', 'export'],
      platforms: ['quest3', 'pcvr', 'visionos', 'webxr', 'web'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-02-20T00:00:00Z',
      updatedAt: '2026-03-06T00:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Analytics',
        traits: [],
        calls: [],
        declaredEffects: ['resource:cpu'],
      },
    ],
    assets: [],
    bundleSizeBytes: 80_000,
  },
];

// ═══════════════════════════════════════════════════════════════════

/**
 * Seed a MarketplaceRegistry with starter packages.
 * Returns the seeded registry.
 */
export function seedMarketplace(registry?: MarketplaceRegistry): MarketplaceRegistry {
  const reg = registry ?? new MarketplaceRegistry();

  for (const pkg of SEED_PACKAGES) {
    reg.publish({
      id: `sub_${Date.now()}_${pkg.metadata.id}`,
      package: pkg,
      status: 'published',
      submittedAt: new Date().toISOString(),
    } as MarketplaceSubmissionType);
  }

  // Add some realistic download counts and ratings
  const ratings: Record<string, number[]> = {
    '@holoscript/zen-garden': [5, 5, 4, 5, 4],
    '@holoscript/neon-arcade': [5, 4, 5, 5, 4, 3],
    '@holoscript/guide-bot': [5, 5, 5, 4],
    '@community/merchant-npc': [4, 3, 4],
    '@holoscript/physics-toybox': [5, 5, 4, 5, 5, 4, 5],
    '@community/weather-system': [5, 4, 5, 4],
    '@holoscript/toon-shader-pack': [5, 5, 4],
    '@community/magic-effects': [4, 5, 4, 3, 5],
    '@holoscript/starter-world': [5, 5, 5, 5, 4, 5, 5, 5],
    '@holoscript/analytics-plugin': [4, 5, 4],
  };

  for (const [id, scores] of Object.entries(ratings)) {
    for (const r of scores) {
      reg.rate(id, r);
    }
  }

  return reg;
}

/** All seed packages (for testing) */
export const SEED_PACKAGES_LIST = SEED_PACKAGES;
export const SEED_COUNT = SEED_PACKAGES.length;
