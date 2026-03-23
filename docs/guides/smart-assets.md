# Smart Assets Guide

> How to load, configure, and bundle assets in HoloScript.

## Overview

HoloScript's Smart Asset system provides intelligent loading, caching, and configuration of 3D assets (models, textures, audio). The `SmartAssetLoader` handles format detection, LOD management, and platform-specific optimizations.

## SmartAssetLoader API

| Method | Purpose |
|--------|---------|
| `load(path)` | Load an asset with automatic format detection |
| `doLoad(path)` | Internal load operation with retry/fallback |
| `getConfig()` | Get the current loader configuration |

### Factory Functions

```typescript
import { createSmartAssetLoader, getSmartAssetLoader } from '@holoscript/core';

// Create a new loader with custom config
const loader = createSmartAssetLoader({
  baseUrl: '/assets/',
  maxConcurrent: 4,
  retryCount: 3,
});

// Get the singleton loader
const sharedLoader = getSmartAssetLoader();
```

## Configuration (LoaderConfig)

```typescript
interface LoaderConfig {
  baseUrl: string;          // Base URL for asset resolution
  maxConcurrent: number;    // Max parallel downloads
  retryCount: number;       // Retry attempts on failure
  timeout: number;          // Request timeout (ms)
  cacheTTL: number;         // Cache time-to-live (ms)
}
```

## CLI Commands

```bash
# Pack assets into an HSA bundle
holoscript pack ./assets/ --output scene.hsa

# Unpack an HSA bundle
holoscript unpack scene.hsa --output ./extracted/
```

## Usage in Compositions

```holo
composition "My Scene" {
  object "Character" {
    geometry: "models/character.glb"
    // SmartAssetLoader handles:
    // - Format detection (glb, gltf, obj, fbx)
    // - LOD selection based on distance
    // - Texture compression (ASTC, BC7, ETC2)
    // - Caching and preloading
  }
}
```

## Related

- [`SmartAssetLoader` source](../../packages/core/src/assets/SmartAssetLoader.ts)
- [Asset pipeline docs](../guides/file-formats.md)
