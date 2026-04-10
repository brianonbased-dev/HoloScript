# Shader Editor v3.5 - Backend Services

Complete backend implementation for HoloScript's visual shader editor with live preview, material library, and comprehensive undo/redo system.

## Features

### 1. ShaderEditorService

- **CRUD Operations**: Create, read, update, delete shader graphs
- **IndexedDB Persistence**: Efficient client-side storage using `idb` library
- **Version Control**: Git-like diff/patch system for shader graphs
- **Auto-Save**: Debounced auto-save queue (2-second delay)
- **Import/Export**: JSON and binary `.shader` format support
- **Cloud Sync**: Optional hooks for cloud synchronization

### 2. LivePreviewService

- **Hot Reload**: Detect changes → recompile → update material
- **Compilation Caching**: Avoid redundant recompilation
- **Error Recovery**: Fallback to last valid shader on errors
- **Performance Monitoring**: Track FPS, compilation time
- **WebGPU Integration**: Shader module creation

### 3. MaterialLibrary

- **25+ Built-in Presets**: PBR, Stylized, VFX materials
- **User Materials**: Save and manage custom materials
- **Tagging System**: Organize by tags (realistic, stylized, vfx, etc.)
- **Search**: Find materials by name, description, or tags
- **Thumbnail Generation**: Auto-generate preview thumbnails
- **Material Variants**: LOD-specific simplified shaders

### 4. ShaderTemplateLibrary

- **12+ Pre-built Templates**: Common shader patterns
- **Categories**: Lighting, Texturing, Animation, VFX
- **Instant Instantiation**: Deep copy with new IDs
- **Custom Templates**: Save current graph as template

### 5. UndoRedoSystem

- **Command Pattern**: All editor actions reversible
- **Action Merging**: Slider drags → single undo step
- **History Stack**: Max 100 actions (configurable)
- **Keyboard Shortcuts**: Ctrl+Z/Y (Cmd on Mac)
- **Persistence**: Save history to localStorage

## Material Library Contents

### PBR Materials (7)

1. **PBR Standard** - Base color + metallic + roughness
2. **Metal** - Brushed metal finish
3. **Plastic** - Smooth plastic material
4. **Glass** - Transparent with fresnel
5. **Fabric** - Velvet with sheen layer
6. **Skin** - Subsurface scattering
7. **Marble** - Polished stone with veining

### Stylized Materials (2)

8. **Toon** - Cel-shaded cartoon material
9. **Unlit** - Flat shading

### VFX Materials (16)

10. **Water** - Gerstner waves + foam + caustics
11. **Fire** - Volumetric fire with blackbody emission
12. **Lava** - Hot lava with animated noise
13. **Hologram** - Sci-fi hologram with scan lines
14. **Force Field** - Energy shield effect
15. **Dissolve** - Noise-driven dissolve with edge glow
16. **Portal** - Swirling portal effect
17. **Neon Light** - Bright neon emission
18. **Caustics** - Underwater light patterns
19. **Ice** - Translucent frozen material
20. **Crystal** - Iridescent crystal
21. **Stained Glass** - Colored translucent glass
22. **Wood** - Natural wood grain
23. **Gold** - Polished gold metal
24. **Chrome** - Mirror-like chrome
25. **Opal** - Iridescent gemstone
26. **Glitter** - Sparkling micro-facet material

## Shader Templates

### Lighting (2)

1. **Fresnel Rim Light** - Edge glow effect
2. **Screen Space Reflection** - Ray-marched SSR

### Texturing (3)

3. **Normal Mapping** - Tangent-space detail
4. **Parallax Occlusion** - Depth illusion
5. **Triplanar Projection** - World-space UVs
6. **Procedural Marble** - FBM noise veining

### Animation (2)

7. **Vertex Wind** - Foliage sway
8. **Water Waves** - Gerstner displacement

### VFX (4)

9. **Dissolve Effect** - Animated fade with edge glow
10. **Holographic Scan Lines** - Sci-fi hologram
11. **Caustics** - Underwater light
12. **Volumetric Fog** - Height-based fog

## Usage Examples

### Basic Setup

```typescript
import {
  getShaderEditorService,
  getLivePreviewService,
  getMaterialLibrary,
  getShaderTemplateLibrary,
  getUndoRedoSystem,
  setupUndoRedoShortcuts,
} from './features/shader-editor';

// Initialize services
const editorService = getShaderEditorService();
await editorService.initialize();

const previewService = getLivePreviewService();
await previewService.initialize();

const materialLibrary = getMaterialLibrary();
await materialLibrary.initialize();

const templateLibrary = getShaderTemplateLibrary();

const undoRedo = getUndoRedoSystem();
setupUndoRedoShortcuts(undoRedo);
```

### Create and Save Graph

```typescript
// Create new graph
const graph = await editorService.create('My Shader', 'Custom shader description', [
  'custom',
  'pbr',
]);

// Add nodes
const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
const outputNode = graph.createNode('output_surface', { x: 300, y: 0 });

// Connect nodes
graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');

// Save
await editorService.update(graph);

// Auto-save (debounced)
editorService.queueAutoSave(graph);
```

### Live Preview

```typescript
// Set graph for preview
previewService.setGraph(graph);

// Listen for compilation events
previewService.onChange((event) => {
  if (event.type === 'compiled') {
    console.log('Compiled successfully!');
  } else if (event.type === 'error') {
    console.error('Compilation failed:', event.result?.error);
  }
});

// Trigger recompilation
const result = await previewService.recompile();

if (result.success) {
  const shader = result.shader;
  // Use shader.vertexCode and shader.fragmentCode
}

// Get performance metrics
const metrics = previewService.getMetrics();
console.log(`FPS: ${metrics.fps}, Cache Hits: ${metrics.cacheHits}`);
```

### Material Library

```typescript
// Get all materials
const allMaterials = await materialLibrary.getAllMaterials();

// Filter by category
const pbrMaterials = await materialLibrary.getAllMaterials('pbr');

// Search
const waterMaterials = await materialLibrary.searchMaterials('water');

// Instantiate preset
const preset = await materialLibrary.getMaterial('water');
const waterGraph = materialLibrary.instantiateMaterial(preset);

// Save custom material
const customMaterial = await materialLibrary.saveMaterial({
  name: 'My Material',
  description: 'Custom shader',
  category: 'custom',
  tags: ['custom'],
  graph: graph.toJSON(),
});

// Generate thumbnail
const thumbnail = await materialLibrary.generateThumbnail(graph);
```

### Shader Templates

```typescript
// Get all templates
const templates = templateLibrary.getAllTemplates();

// Filter by category
const lightingTemplates = templateLibrary.getAllTemplates('lighting');

// Instantiate template
const fresnelGraph = templateLibrary.instantiate('fresnel_rim_light');

// Search
const dissolveTemplates = templateLibrary.search('dissolve');
```

### Undo/Redo

```typescript
import {
  AddNodeCommand,
  DeleteNodeCommand,
  ConnectCommand,
  SetPropertyCommand,
} from './features/shader-editor';

// Set graph
undoRedo.setGraph(graph);

// Execute commands
undoRedo.execute(new AddNodeCommand('constant_float', { x: 100, y: 100 }));
undoRedo.execute(new SetPropertyCommand(nodeId, 'value', 42));

// Undo/Redo
undoRedo.undo();
undoRedo.redo();

// Check state
if (undoRedo.canUndo()) {
  undoRedo.undo();
}

// Listen to changes
undoRedo.onChange((event) => {
  console.log(`Action: ${event.type}, Can Undo: ${event.canUndo}, Can Redo: ${event.canRedo}`);
});

// Get history
const history = undoRedo.getHistory();
```

### Version Control

```typescript
// Create version snapshot
await editorService.createVersion(graph.id, 'Added rim lighting');

// Get all versions
const versions = await editorService.getVersions(graph.id);

// Restore version
const restoredGraph = await editorService.restoreVersion(versionId);
```

### Import/Export

```typescript
// Export to JSON
const json = await editorService.exportJSON(graph.id);

// Import from JSON
const importedGraph = await editorService.importJSON(json);

// Export to binary .shader format
const binary = await editorService.exportBinary(graph.id);

// Import from binary
const binaryGraph = await editorService.importBinary(binary);
```

## Architecture

### Service Layer

```
┌─────────────────────────────────────────────────────────┐
│                   Shader Editor UI                      │
└─────────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│ Editor Service  │ │   Preview    │ │   Undo/Redo     │
│  - Persistence  │ │   - Compile  │ │   - Commands    │
│  - Versioning   │ │   - Hot Reload│ │   - History     │
│  - Import/Export│ │   - WebGPU   │ │   - Shortcuts   │
└─────────────────┘ └──────────────┘ └─────────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │    Shader Graph       │
                │  @holoscript/core     │
                └───────────────────────┘
```

### Data Flow

```
User Edit → Command → Execute → Graph Mutation → Auto-Save → IndexedDB
                 │
                 └─→ Undo Stack

Graph Change → Recompile → WebGPU Shader → Material Update → Render
                    │
                    └─→ Cache
```

## Testing

Run the comprehensive test suite:

```bash
npm test -- shader-editor
```

15 tests covering:

- Graph persistence (save/load/delete)
- Live reload behavior
- Undo/redo correctness
- Template instantiation
- Material library operations

## Performance

- **Auto-save**: 2-second debounce reduces DB writes
- **Compilation Cache**: Avoids redundant shader compilation
- **Command Merging**: Reduces undo stack size (e.g., slider drags)
- **IndexedDB**: Fast client-side storage
- **Lazy Loading**: Services initialized on demand

## Browser Support

- **Chrome/Edge**: Full support (WebGPU required for live preview)
- **Firefox**: Full support (WebGPU experimental)
- **Safari**: Partial support (IndexedDB only)

## Integration Notes

### UI Components

The visual shader editor UI (node graph canvas, property panels, etc.) is implemented by a parallel agent. These backend services provide the foundation.

### Shader Graph

Imports from `@holoscript/core/shader/graph`:

- `ShaderGraph` - Graph data structure
- `ShaderGraphCompiler` - WGSL code generation
- `ShaderGraphTypes` - Type definitions

### WebGPU

Live preview requires WebGPU support. Gracefully degrades to compilation-only mode if WebGPU is unavailable.

## File Structure

```
packages/studio/src/features/shader-editor/
├── ShaderEditorService.ts       (309 lines)
├── LivePreviewService.ts        (250 lines)
├── MaterialLibrary.ts           (1247 lines)
├── ShaderTemplates.ts           (627 lines)
├── UndoRedoSystem.ts            (436 lines)
├── index.ts                     (39 lines)
├── README.md                    (this file)
└── __tests__/
    └── ShaderEditorIntegration.test.ts  (376 lines)

Total: ~3,284 lines of production code + 376 test lines
```

## License

Part of HoloScript - See root LICENSE file.
