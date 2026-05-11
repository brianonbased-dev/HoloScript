export const DEV_MEMORY_PERSISTENCE_MODE = 'memory-dev';

export interface DevSnapshot {
  id: string;
  sceneId: string;
  label: string;
  dataUrl: string;
  code: string;
  createdAt: string;
}

export interface DevSceneVersion {
  versionId: string;
  sceneId: string;
  label: string;
  code: string;
  savedAt: string;
  lineCount: number;
}

export interface DevSharedScene {
  id: string;
  name: string;
  code: string;
  author: string;
  createdAt: string;
  views: number;
}

export interface DevRegistryPack {
  packId: string;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  files: { name: string; size: number; type: string }[];
  downloads: number;
  publishedAt: string;
  previewCode?: string;
}

export interface StudioDevMemoryStores {
  snapshots: Record<string, DevSnapshot[]>;
  versionsByScene: Map<string, DevSceneVersion[]>;
  sharedScenes: Map<string, DevSharedScene>;
  registryPacks: DevRegistryPack[];
}

declare global {
  var __studioApiDevMemoryStores__: StudioDevMemoryStores | undefined;
}

export function isDevMemoryPersistenceAllowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.NODE_ENV !== 'production' && env.STUDIO_API_PERSISTENCE === DEV_MEMORY_PERSISTENCE_MODE;
}

export function requireDevMemoryPersistence(
  surface: string,
  env: NodeJS.ProcessEnv = process.env
): Response | null {
  if (isDevMemoryPersistenceAllowed(env)) return null;

  const production = env.NODE_ENV === 'production';
  return Response.json(
    {
      error: 'Durable persistence is not configured',
      surface,
      missing: ['DATABASE_URL'],
      devFallback: {
        allowed: false,
        reason: production
          ? 'In-memory persistence is disabled when NODE_ENV=production'
          : `Set STUDIO_API_PERSISTENCE=${DEV_MEMORY_PERSISTENCE_MODE} for local dev only`,
      },
    },
    { status: 503 }
  );
}

export function getStudioPersistenceProbe(env: NodeJS.ProcessEnv = process.env) {
  return {
    database: {
      configured: Boolean(env.DATABASE_URL),
      missing: env.DATABASE_URL ? [] : ['DATABASE_URL'],
    },
    devMemory: {
      mode: env.STUDIO_API_PERSISTENCE ?? null,
      allowed: isDevMemoryPersistenceAllowed(env),
      requiredMode: DEV_MEMORY_PERSISTENCE_MODE,
      productionSafe: env.NODE_ENV !== 'production',
    },
  };
}

export function getStudioDevMemoryStores(): StudioDevMemoryStores {
  return (
    globalThis.__studioApiDevMemoryStores__ ??
    (globalThis.__studioApiDevMemoryStores__ = {
      snapshots: {},
      versionsByScene: new Map<string, DevSceneVersion[]>(),
      sharedScenes: new Map<string, DevSharedScene>(),
      registryPacks: seedRegistryPacks(),
    })
  );
}

export function resetStudioDevMemoryStoresForTests(): void {
  globalThis.__studioApiDevMemoryStores__ = undefined;
}

function seedRegistryPacks(): DevRegistryPack[] {
  return [
    {
      packId: 'pack_medieval_001',
      name: 'Medieval Castle Kit',
      description: 'Stone walls, towers, portcullis, and interior props for fantasy scenes.',
      author: 'HoloStudio',
      version: '1.2.0',
      tags: ['fantasy', 'architecture', 'medieval'],
      files: [
        { name: 'castle_walls.glb', size: 2_400_000, type: 'model/gltf-binary' },
        { name: 'stone_texture.png', size: 512_000, type: 'image/png' },
      ],
      downloads: 1_432,
      publishedAt: '2026-04-27T00:00:00.000Z',
      previewCode: `scene "Castle" {\n  object "Main Tower" {\n    @mesh(src: "castle_walls.glb")\n    @transform(scale: [2,2,2])\n  }\n}`,
    },
    {
      packId: 'pack_sci_fi_002',
      name: 'Sci-Fi Interior Pack',
      description: 'Modular corridors, consoles, and ambient lighting for space stations.',
      author: 'NeonForge',
      version: '0.9.1',
      tags: ['sci-fi', 'interior', 'modular'],
      files: [
        { name: 'corridor_a.glb', size: 1_800_000, type: 'model/gltf-binary' },
        { name: 'console_01.glb', size: 900_000, type: 'model/gltf-binary' },
      ],
      downloads: 876,
      publishedAt: '2026-05-06T00:00:00.000Z',
      previewCode: `scene "Space Station" {\n  object "Corridor A" {\n    @mesh(src: "corridor_a.glb")\n  }\n}`,
    },
    {
      packId: 'pack_vegetation_003',
      name: 'Procedural Vegetation',
      description: 'Trees, bushes, grass patches, and flowers with LOD support.',
      author: 'GreenPixel',
      version: '2.0.0',
      tags: ['nature', 'vegetation', 'outdoor'],
      files: [
        { name: 'oak_tree.glb', size: 3_200_000, type: 'model/gltf-binary' },
        { name: 'grass_patch.glb', size: 400_000, type: 'model/gltf-binary' },
      ],
      downloads: 2_901,
      publishedAt: '2026-04-11T00:00:00.000Z',
    },
  ];
}
