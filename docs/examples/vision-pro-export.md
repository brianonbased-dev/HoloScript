# Apple Vision Pro Export Example

Complete guide to exporting HoloScript scenes for Apple Vision Pro.

## Quick Start

```typescript
import { USDZExporter } from '@holoscript/core/export/usdz';
import { createEmptySceneGraph, createDefaultMaterial } from '@holoscript/core/export';

// Create scene
const scene = createEmptySceneGraph('VisionProDemo');

// Add material
const material = createDefaultMaterial('chrome', 'ChromeMaterial');
material.baseColor = [0.8, 0.8, 0.8, 1];
material.metallic = 1.0;
material.roughness = 0.1;
scene.materials.push(material);

// Export to USDZ
const exporter = new USDZExporter({
  placementMode: 'floor',
  lookAtCamera: true,
  materialQuality: 'high',
  enableOcclusion: true,
});

const result = await exporter.export(scene);

// Download in browser
const blob = new Blob([result.usdz], { type: 'model/vnd.usdz+zip' });
const link = document.createElement('a');
link.href = URL.createObjectURL(blob);
link.download = 'vision-pro-demo.usdz';
link.click();
```

## AR Quick Look Integration

### HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>AR Quick Look Demo</title>
  <style>
    .ar-button {
      display: inline-block;
      padding: 20px 40px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    }

    .ar-button img {
      width: 200px;
      height: 200px;
      border-radius: 8px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <a href="model.usdz" rel="ar" class="ar-button">
    <img src="thumbnail.png" alt="3D Model">
    <div>View in AR</div>
  </a>
</body>
</html>
```

### React Component

```typescript
import React, { useState } from 'react';
import { USDZExporter } from '@holoscript/core/export/usdz';

export function ARQuickLookButton({ sceneGraph }) {
  const [usdzUrl, setUsdzUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const exporter = new USDZExporter({
        placementMode: 'floor',
        lookAtCamera: true,
        materialQuality: 'high',
      });

      const result = await exporter.export(sceneGraph);
      const blob = new Blob([result.usdz], { type: 'model/vnd.usdz+zip' });
      const url = URL.createObjectURL(blob);

      setUsdzUrl(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      {!usdzUrl ? (
        <button onClick={handleExport} disabled={isExporting}>
          {isExporting ? 'Exporting...' : 'View in AR'}
        </button>
      ) : (
        <a href={usdzUrl} rel="ar" download="model.usdz">
          <img src="/ar-icon.png" alt="View in AR" />
          View in AR Quick Look
        </a>
      )}
    </div>
  );
}
```

## Vision Pro Specific Features

### Spatial Computing

```typescript
import { USDZExporter } from '@holoscript/core/export/usdz';

// Create spatial environment
const exporter = new USDZExporter({
  // Placement
  placementMode: 'any', // Free placement in space

  // Interaction
  lookAtCamera: false, // Let user move around object
  allowContentScaling: true, // Allow pinch-to-zoom

  // Rendering
  enableOcclusion: true, // Occlude behind real objects
  materialQuality: 'high', // High-quality materials

  // Scale (Vision Pro expects meters)
  metersPerUnit: 1.0,
  upAxis: 'Y',

  // Camera
  canonicalCameraDistance: 2.0, // 2 meters default view
});
```

### Multi-User Experiences

```typescript
// Create shared AR experience
const scene = createEmptySceneGraph('SharedSpace');

// Add anchor point
const anchor = createEmptyNode('anchor', 'SharedAnchor');
anchor.transform.position = { x: 0, y: 0, z: 0 };

// Add interactive objects
const board = createEmptyNode('board', 'GameBoard');
board.transform.position = { x: 0, y: 0.8, z: 0 }; // Table height
board.transform.scale = { x: 0.6, y: 0.01, z: 0.6 };

anchor.children.push(board);
scene.root.children.push(anchor);

// Export for collaborative AR
const exporter = new USDZExporter({
  placementMode: 'table',
  lookAtCamera: false, // Shared view
  allowContentScaling: false, // Fixed size for all users
});

const result = await exporter.export(scene);
```

## Advanced Examples

### Dynamic Material Updates

```typescript
class DynamicMaterialExporter {
  private exporter: USDZExporter;
  private scene: ISceneGraph;

  constructor(scene: ISceneGraph) {
    this.scene = scene;
    this.exporter = new USDZExporter({
      placementMode: 'floor',
      materialQuality: 'high',
    });
  }

  async exportWithColor(color: [number, number, number, number]) {
    // Update material
    if (this.scene.materials.length > 0) {
      this.scene.materials[0].baseColor = color;
    }

    // Re-export
    const result = await this.exporter.export(this.scene);
    return result.usdz;
  }

  async exportWithMetallic(metallic: number) {
    if (this.scene.materials.length > 0) {
      this.scene.materials[0].metallic = metallic;
      this.scene.materials[0].roughness = 1.0 - metallic;
    }

    const result = await this.exporter.export(this.scene);
    return result.usdz;
  }
}

// Usage
const exporter = new DynamicMaterialExporter(scene);

// Generate red variant
const redUsdz = await exporter.exportWithColor([1, 0, 0, 1]);

// Generate metallic variant
const metallicUsdz = await exporter.exportWithMetallic(0.9);
```

### Batch Export for Product Variants

```typescript
async function exportProductVariants(
  baseScene: ISceneGraph,
  variants: Array<{
    name: string;
    color: [number, number, number, number];
    finish: 'matte' | 'glossy' | 'metallic';
  }>
) {
  const results = [];

  for (const variant of variants) {
    // Clone scene
    const scene = JSON.parse(JSON.stringify(baseScene)) as ISceneGraph;

    // Update material
    if (scene.materials.length > 0) {
      scene.materials[0].baseColor = variant.color;

      switch (variant.finish) {
        case 'matte':
          scene.materials[0].metallic = 0.0;
          scene.materials[0].roughness = 1.0;
          break;
        case 'glossy':
          scene.materials[0].metallic = 0.0;
          scene.materials[0].roughness = 0.1;
          break;
        case 'metallic':
          scene.materials[0].metallic = 1.0;
          scene.materials[0].roughness = 0.3;
          break;
      }
    }

    // Export
    const exporter = new USDZExporter({
      placementMode: 'table',
      materialQuality: 'high',
    });

    const result = await exporter.export(scene);

    results.push({
      name: variant.name,
      usdz: result.usdz,
      size: result.stats.usdzSize,
    });
  }

  return results;
}

// Usage
const variants = [
  { name: 'Red Matte', color: [1, 0, 0, 1], finish: 'matte' },
  { name: 'Blue Glossy', color: [0, 0, 1, 1], finish: 'glossy' },
  { name: 'Silver Metallic', color: [0.8, 0.8, 0.8, 1], finish: 'metallic' },
];

const results = await exportProductVariants(baseScene, variants);

// Download all variants
for (const result of results) {
  const blob = new Blob([result.usdz], { type: 'model/vnd.usdz+zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${result.name}.usdz`;
  link.click();
}
```

### Node.js Server-Side Export

```typescript
import { USDZExporter } from '@holoscript/core/export/usdz';
import { writeFile } from 'fs/promises';
import { join } from 'path';

async function exportToFile(
  scene: ISceneGraph,
  outputPath: string
): Promise<void> {
  const exporter = new USDZExporter({
    placementMode: 'floor',
    materialQuality: 'high',
    enableOcclusion: true,
  });

  const result = await exporter.export(scene);

  // Save to file
  await writeFile(outputPath, Buffer.from(result.usdz));

  console.log(`Exported to ${outputPath}`);
  console.log(`Size: ${(result.stats.usdzSize / 1024).toFixed(2)} KB`);
  console.log(`Time: ${result.stats.exportTime.toFixed(2)} ms`);
}

// Usage
await exportToFile(scene, './output/model.usdz');
```

### Express.js API Endpoint

```typescript
import express from 'express';
import { USDZExporter } from '@holoscript/core/export/usdz';

const app = express();
app.use(express.json());

app.post('/api/export/usdz', async (req, res) => {
  try {
    const { sceneGraph, options } = req.body;

    const exporter = new USDZExporter(options);
    const result = await exporter.export(sceneGraph);

    res.setHeader('Content-Type', 'model/vnd.usdz+zip');
    res.setHeader('Content-Disposition', 'attachment; filename="model.usdz"');
    res.send(Buffer.from(result.usdz));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('USDZ export API running on port 3000');
});
```

## Performance Optimization

### Caching Strategy

```typescript
class USDZExportCache {
  private cache = new Map<string, ArrayBuffer>();

  async exportWithCache(
    scene: ISceneGraph,
    options: IUSDZExportOptions
  ): Promise<ArrayBuffer> {
    const key = this.getCacheKey(scene, options);

    if (this.cache.has(key)) {
      console.log('Cache hit!');
      return this.cache.get(key)!;
    }

    const exporter = new USDZExporter(options);
    const result = await exporter.export(scene);

    this.cache.set(key, result.usdz);
    return result.usdz;
  }

  private getCacheKey(
    scene: ISceneGraph,
    options: IUSDZExportOptions
  ): string {
    return JSON.stringify({ scene, options });
  }

  clear() {
    this.cache.clear();
  }
}
```

### Worker Thread Export

```typescript
// worker.ts
import { USDZExporter } from '@holoscript/core/export/usdz';

self.onmessage = async (e) => {
  const { sceneGraph, options } = e.data;

  const exporter = new USDZExporter(options);
  const result = await exporter.export(sceneGraph);

  self.postMessage({
    usdz: result.usdz,
    stats: result.stats,
  }, [result.usdz]);
};

// main.ts
const worker = new Worker('worker.ts');

worker.onmessage = (e) => {
  const { usdz, stats } = e.data;
  console.log('Export complete:', stats);

  const blob = new Blob([usdz], { type: 'model/vnd.usdz+zip' });
  // Use blob...
};

worker.postMessage({
  sceneGraph: scene,
  options: { placementMode: 'floor' },
});
```

## Testing with Vision Pro Simulator

```bash
# Install Apple Developer Tools
xcode-select --install

# Open Reality Composer
open -a "Reality Composer"

# Validate USDZ
usdchecker model.usdz

# View in AR Quick Look
open model.usdz

# Test in Vision Pro Simulator
xcrun simctl boot "Apple Vision Pro"
xcrun simctl openurl booted "file://$(pwd)/model.usdz"
```

## Troubleshooting

### Issue: USDZ file won't open

```typescript
// Enable debug output
const exporter = new USDZExporter(options);
const result = await exporter.export(scene);

// Inspect USD stage
console.log('USD Stage:', JSON.stringify(result.stage, null, 2));

// Validate structure
if (result.stats.primCount === 0) {
  console.error('No prims in stage!');
}
```

### Issue: Materials look wrong

```typescript
// Check material conversion
const material = scene.materials[0];
console.log('Input material:', {
  baseColor: material.baseColor,
  metallic: material.metallic,
  roughness: material.roughness,
});

// Export and check
const result = await exporter.export(scene);
const usdMaterial = result.stage.prims[0].children
  ?.find(p => p.name === 'Materials')
  ?.children?.[0];

console.log('USD material:', usdMaterial);
```

## Resources

- [Apple AR Quick Look Documentation](https://developer.apple.com/augmented-reality/quick-look/)
- [USD Documentation](https://graphics.pixar.com/usd/docs/index.html)
- [Vision Pro Developer Guide](https://developer.apple.com/visionos/)
- [Reality Composer Pro](https://developer.apple.com/augmented-reality/tools/)

## License

MIT - HoloScript Team
