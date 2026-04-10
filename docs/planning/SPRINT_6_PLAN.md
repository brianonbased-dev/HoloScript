# Sprint 6: Spatial Export & Rendering

**Version**: v3.3.0  
**Target Date**: September 2026  
**Theme**: Cross-platform spatial asset export and distributed rendering

---

## Overview

Sprint 6 delivers **Spatial Export & Rendering** capabilities, enabling HoloScript scenes to be exported to industry-standard formats (GLB/GLTF, USD, USDZ) and rendered via distributed infrastructure. Building on Sprint 5's swarm coordination, this sprint focuses on getting HoloScript content into production environments.

### Key Value Propositions

1. **Universal Export**: One scene → multiple platforms (Web, Mobile AR, Vision Pro, Quest)
2. **Distributed Rendering**: Offload heavy rendering to Render Network nodes
3. **Asset Pipeline**: Production-ready asset management with optimization
4. **Volumetric Support**: Gaussian Splatting and volumetric video integration

---

## Sprint Priorities

| Priority | Focus                      | Effort | Dependencies   | Status      |
| -------- | -------------------------- | ------ | -------------- | ----------- |
| **1**    | Scene Serialization        | Medium | Core complete  | ✅ Complete |
| **2**    | GLB/GLTF Export            | High   | Priority 1     | ✅ Complete |
| **3**    | USD/USDZ Export            | High   | Priority 1     | ✅ Complete |
| **4**    | Asset Optimization         | Medium | Priority 2, 3  | ✅ Complete |
| **5**    | Render Network Integration | High   | Priority 2     | ✅ Complete |
| **6**    | Mobile AR Optimization     | Medium | Priority 2, 4  | ✅ Complete |
| **7**    | Volumetric Video Support   | High   | Priority 1     | ✅ Complete |
| **8**    | Export CLI & API           | Medium | All priorities | ✅ Complete |

---

## Priority 1: Scene Serialization

**Goal:** Serialize HoloScript scene graphs to intermediate representation (IR) for export

**Effort**: 2 weeks | **Risk**: Low

### Design

```typescript
// Scene serialization interfaces
export interface ISceneNode {
  id: string;
  type: 'object' | 'light' | 'camera' | 'group' | 'agent';
  name: string;
  transform: ITransform;
  children: ISceneNode[];
  components: IComponent[];
  metadata: Record<string, unknown>;
}

export interface ITransform {
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion
  scale: [number, number, number];
}

export interface ISceneGraph {
  version: string;
  root: ISceneNode;
  materials: IMaterial[];
  textures: ITexture[];
  animations: IAnimation[];
  extensions: Record<string, unknown>;
}

export class SceneSerializer {
  serialize(scene: Scene): ISceneGraph;
  deserialize(graph: ISceneGraph): Scene;
  toJSON(): string;
  fromJSON(json: string): ISceneGraph;
  toBinary(): ArrayBuffer;
  fromBinary(buffer: ArrayBuffer): ISceneGraph;
}
```

### HoloScript Syntax

```holoscript
@export_config(
  format: "glb" | "usdz" | "all",
  optimize: true,
  compress: "draco" | "meshopt" | "none"
)

scene#my_scene {
  @serialize_metadata {
    author: "HoloScript",
    license: "CC-BY-4.0",
    tags: ["interactive", "spatial"]
  }
}
```

### Deliverables

- `packages/core/src/export/SceneSerializer.ts`
- `packages/core/src/export/SceneGraph.ts` (IR types)
- `packages/core/src/export/BinarySerializer.ts`
- 40+ unit tests

### Acceptance Criteria

- [ ] Scene → IR → Scene round-trip preserves all data
- [ ] Binary format is 50%+ smaller than JSON
- [ ] Handles nested hierarchies (100+ nodes)
- [ ] Serializes all component types

---

## Priority 2: GLB/GLTF Export

**Goal:** Export HoloScript scenes to GLB/GLTF 2.0 format

**Effort**: 3 weeks | **Risk**: Medium

### Design

```typescript
export interface IGLTFExportOptions {
  binary: boolean; // GLB vs GLTF
  embedTextures: boolean; // Embed or reference
  compression: 'draco' | 'meshopt' | 'none';
  animations: boolean;
  extensions: string[]; // KHR_materials_pbrSpecularGlossiness, etc.
}

export class GLTFExporter {
  constructor(options?: IGLTFExportOptions);

  export(scene: Scene): Promise<GLTFResult>;
  exportNode(node: ISceneNode): GLTF.Node;
  exportMesh(mesh: Mesh): GLTF.Mesh;
  exportMaterial(material: Material): GLTF.Material;
  exportAnimation(animation: Animation): GLTF.Animation;

  // Extensions
  addExtension(name: string, handler: ExtensionHandler): void;
}

export interface GLTFResult {
  gltf: GLTF.Document;
  binary?: ArrayBuffer;
  resources: Map<string, ArrayBuffer>;
}
```

### Deliverables

- `packages/core/src/export/gltf/GLTFExporter.ts`
- `packages/core/src/export/gltf/GLTFDocument.ts`
- `packages/core/src/export/gltf/extensions/` (KHR_draco_mesh_compression, etc.)
- `packages/core/src/export/gltf/DracoEncoder.ts`
- `packages/core/src/export/gltf/MeshOptEncoder.ts`
- 60+ unit tests

### Acceptance Criteria

- [ ] Exports valid GLB/GLTF 2.0 (passes glTF Validator)
- [ ] Draco compression reduces mesh size by 80%+
- [ ] Supports PBR materials with all texture maps
- [ ] Animations export with correct timing

---

## Priority 3: USD/USDZ Export

**Goal:** Export to Universal Scene Description for Apple Vision Pro and DCC tools

**Effort**: 3 weeks | **Risk**: Medium

### Design

```typescript
export interface IUSDExportOptions {
  format: 'usda' | 'usdc' | 'usdz';
  arKitCompatible: boolean; // USDZ with AR Quick Look support
  materialConversion: 'preview' | 'full';
  includeSkeleton: boolean;
}

export class USDExporter {
  constructor(options?: IUSDExportOptions);

  export(scene: Scene): Promise<USDResult>;
  exportPrim(node: ISceneNode): USD.Prim;
  exportMesh(mesh: Mesh): USD.GeomMesh;
  exportMaterial(material: Material): USD.PreviewSurface;

  // USDZ packaging
  package(assets: USDAsset[]): Promise<ArrayBuffer>;
}
```

### Deliverables

- `packages/core/src/export/usd/USDExporter.ts`
- `packages/core/src/export/usd/USDZPackager.ts`
- `packages/core/src/export/usd/PreviewSurfaceConverter.ts`
- `packages/core/src/export/usd/ARKitOptimizer.ts`
- 50+ unit tests

### Acceptance Criteria

- [ ] USDZ opens in Apple Vision Pro
- [ ] USDA readable by DCC tools (Blender, Houdini)
- [ ] Materials convert correctly to PreviewSurface
- [ ] AR Quick Look animations work on iOS

---

## Priority 4: Asset Optimization

**Goal:** Optimize exported assets for target platforms

**Effort**: 2 weeks | **Risk**: Low

### Design

```typescript
export interface IOptimizationOptions {
  target: 'web' | 'mobile' | 'desktop' | 'xr';
  textureResolution: number; // Max texture dimension
  meshSimplification: number; // 0-1, ratio to keep
  atlasTextures: boolean;
  generateLODs: boolean;
  lodLevels: number;
}

export class AssetOptimizer {
  constructor(options?: IOptimizationOptions);

  optimize(scene: ISceneGraph): Promise<ISceneGraph>;

  // Individual optimizations
  simplifyMesh(mesh: Mesh, ratio: number): Mesh;
  resizeTexture(texture: Texture, maxSize: number): Texture;
  generateTextureAtlas(textures: Texture[]): TextureAtlas;
  generateLOD(mesh: Mesh, levels: number): LODMesh;

  // Analysis
  analyzeScene(scene: ISceneGraph): OptimizationReport;
}

export interface OptimizationReport {
  originalSize: number;
  optimizedSize: number;
  triangleCount: { before: number; after: number };
  textureMemory: { before: number; after: number };
  recommendations: string[];
}
```

### Deliverables

- `packages/core/src/export/optimize/AssetOptimizer.ts`
- `packages/core/src/export/optimize/MeshSimplifier.ts`
- `packages/core/src/export/optimize/TextureAtlas.ts`
- `packages/core/src/export/optimize/LODGenerator.ts`
- 45+ unit tests

### Acceptance Criteria

- [ ] Mobile target produces <10MB bundles
- [ ] Mesh simplification preserves visual quality at 50%
- [ ] Texture atlasing reduces draw calls by 60%+
- [ ] LOD generation creates 3+ levels automatically

---

## Priority 5: Render Network Integration

**Goal:** Offload heavy rendering to distributed Render Network nodes

**Effort**: 3 weeks | **Risk**: High

### Design

```typescript
export interface IRenderJobOptions {
  scene: ISceneGraph;
  resolution: { width: number; height: number };
  format: 'png' | 'jpg' | 'exr' | 'mp4';
  quality: 'preview' | 'production' | 'final';
  frames?: { start: number; end: number; fps: number };
}

export interface IRenderJob {
  id: string;
  status: 'queued' | 'rendering' | 'complete' | 'failed';
  progress: number;
  estimatedTime: number;
  cost: { credits: number; currency: string };
  result?: IRenderResult;
}

export class RenderNetworkClient {
  constructor(config: RenderNetworkConfig);

  // Job management
  submit(options: IRenderJobOptions): Promise<IRenderJob>;
  getStatus(jobId: string): Promise<IRenderJob>;
  cancel(jobId: string): Promise<void>;

  // Results
  download(jobId: string): Promise<ArrayBuffer>;
  stream(jobId: string): AsyncIterable<ArrayBuffer>;

  // Account
  getBalance(): Promise<{ credits: number }>;
  estimateCost(options: IRenderJobOptions): Promise<CostEstimate>;
}
```

### HoloScript Syntax

```holoscript
@render_network(
  enabled: true,
  quality: "production",
  fallback: "local"
)

scene#cinematic {
  @distributed_render {
    resolution: 4096x4096,
    format: "exr",
    deadline: 60min
  }
}
```

### Deliverables

- `packages/core/src/export/render/RenderNetworkClient.ts`
- `packages/core/src/export/render/JobManager.ts`
- `packages/core/src/export/render/CostEstimator.ts`
- `packages/core/src/export/render/ResultDownloader.ts`
- 35+ unit tests

### Acceptance Criteria

- [ ] Jobs submit to Render Network successfully
- [ ] Progress updates stream in real-time
- [ ] Cost estimation accurate within 10%
- [ ] Automatic retry on transient failures

---

## Priority 6: Mobile AR Optimization

**Goal:** Optimize exports specifically for mobile AR (ARCore, ARKit)

**Effort**: 2 weeks | **Risk**: Low

### Design

```typescript
export interface IMobileAROptions {
  platform: 'arcore' | 'arkit' | 'both';
  maxTextureSize: 1024 | 2048;
  maxTriangles: number;
  occlusionSupport: boolean;
  lightEstimation: boolean;
}

export class MobileARExporter {
  constructor(options?: IMobileAROptions);

  export(scene: Scene): Promise<MobileARBundle>;

  // Platform-specific
  exportARCore(scene: Scene): Promise<GLTFResult>;
  exportARKit(scene: Scene): Promise<USDZResult>;

  // Optimization
  optimizeForAR(scene: ISceneGraph): ISceneGraph;
  generateAnchors(scene: Scene): ARAnchor[];
}

export interface MobileARBundle {
  arcore?: ArrayBuffer; // GLB
  arkit?: ArrayBuffer; // USDZ
  manifest: ARManifest;
}
```

### Deliverables

- `packages/core/src/export/mobile/MobileARExporter.ts`
- `packages/core/src/export/mobile/ARCoreOptimizer.ts`
- `packages/core/src/export/mobile/ARKitOptimizer.ts`
- `packages/core/src/export/mobile/AnchorGenerator.ts`
- 40+ unit tests

### Acceptance Criteria

- [ ] GLB loads in ARCore Scene Viewer
- [ ] USDZ loads in iOS AR Quick Look
- [ ] 60fps on mid-range mobile devices
- [ ] Anchor generation works with plane detection

---

## Priority 7: Volumetric Video Support

**Goal:** Support Gaussian Splatting and volumetric video in exports

**Effort**: 3 weeks | **Risk**: High

### Design

```typescript
export interface IVolumetricOptions {
  format: 'splat' | 'nvdb' | 'avv'; // Gaussian Splatting, NanoVDB, Arcturus
  quality: 'low' | 'medium' | 'high';
  streaming: boolean;
}

export interface IGaussianSplat {
  positions: Float32Array; // xyz per splat
  scales: Float32Array; // scale per splat
  rotations: Float32Array; // quaternion per splat
  colors: Uint8Array; // RGBA SH coefficients
  opacities: Float32Array; // opacity per splat
}

export class VolumetricExporter {
  constructor(options?: IVolumetricOptions);

  // Gaussian Splatting
  exportSplat(splat: IGaussianSplat): Promise<ArrayBuffer>;
  importSplat(data: ArrayBuffer): Promise<IGaussianSplat>;
  optimizeSplat(splat: IGaussianSplat, targetCount: number): IGaussianSplat;

  // Volumetric video
  exportVolumetric(video: VolumetricVideo): Promise<VolumetricResult>;
  streamVolumetric(url: string): AsyncIterable<VolumetricFrame>;
}
```

### HoloScript Syntax

```holoscript
object#volumetric_capture {
  @volumetric(
    source: "captures/scene.splat",
    format: "gaussian",
    quality: "high"
  )

  @streaming(
    enabled: true,
    bufferSize: 30 // frames
  )
}
```

### Deliverables

- `packages/core/src/export/volumetric/VolumetricExporter.ts`
- `packages/core/src/export/volumetric/GaussianSplatEncoder.ts`
- `packages/core/src/export/volumetric/GaussianSplatDecoder.ts`
- `packages/core/src/export/volumetric/VolumetricStreamer.ts`
- 50+ unit tests

### Acceptance Criteria

- [ ] Import/export .splat files correctly
- [ ] Gaussian Splatting renders at 30fps on Quest 3
- [ ] Streaming volumetric video with <100ms latency
- [ ] Splat optimization retains visual quality

---

## Priority 8: Export CLI & API

**Goal:** Command-line tools and programmatic API for batch exports

**Effort**: 2 weeks | **Risk**: Low

### Design

```typescript
// CLI: holo export scene.holo --format glb --optimize mobile

export interface IExportOptions {
  input: string | Scene;
  output: string;
  format: 'glb' | 'gltf' | 'usdz' | 'usda' | 'usdc';
  optimize?: 'web' | 'mobile' | 'xr' | 'none';
  compress?: 'draco' | 'meshopt' | 'none';
  verbose?: boolean;
}

export class ExportPipeline {
  constructor(options?: PipelineOptions);

  // Single export
  export(options: IExportOptions): Promise<ExportResult>;

  // Batch export
  exportBatch(inputs: IExportOptions[]): Promise<ExportResult[]>;

  // Pipeline stages
  addStage(stage: IPipelineStage): this;
  removeStage(name: string): this;

  // Events
  on(event: 'progress', handler: ProgressHandler): this;
  on(event: 'complete', handler: CompleteHandler): this;
  on(event: 'error', handler: ErrorHandler): this;
}
```

### CLI Commands

```bash
# Single file export
holo export scene.holo --format glb

# Batch export with optimization
holo export scenes/*.holo --format usdz --optimize mobile --output dist/

# Render via Render Network
holo render scene.holo --resolution 4096x4096 --quality production

# Analysis only
holo analyze scene.holo --report json
```

### Deliverables

- `packages/cli/src/commands/export.ts`
- `packages/cli/src/commands/render.ts`
- `packages/cli/src/commands/analyze.ts`
- `packages/core/src/export/ExportPipeline.ts`
- 35+ unit tests

### Acceptance Criteria

- [ ] CLI exports all supported formats
- [ ] Batch export processes 100 files in <5 min
- [ ] Progress events fire accurately
- [ ] Error handling with clear messages

---

## Architecture

```
packages/core/src/export/
├── SceneSerializer.ts
├── SceneGraph.ts
├── BinarySerializer.ts
├── ExportPipeline.ts
├── gltf/
│   ├── GLTFExporter.ts
│   ├── GLTFDocument.ts
│   ├── DracoEncoder.ts
│   ├── MeshOptEncoder.ts
│   └── extensions/
│       ├── KHR_draco_mesh_compression.ts
│       ├── KHR_materials_unlit.ts
│       └── KHR_texture_transform.ts
├── usd/
│   ├── USDExporter.ts
│   ├── USDZPackager.ts
│   ├── PreviewSurfaceConverter.ts
│   └── ARKitOptimizer.ts
├── optimize/
│   ├── AssetOptimizer.ts
│   ├── MeshSimplifier.ts
│   ├── TextureAtlas.ts
│   └── LODGenerator.ts
├── render/
│   ├── RenderNetworkClient.ts
│   ├── JobManager.ts
│   ├── CostEstimator.ts
│   └── ResultDownloader.ts
├── mobile/
│   ├── MobileARExporter.ts
│   ├── ARCoreOptimizer.ts
│   ├── ARKitOptimizer.ts
│   └── AnchorGenerator.ts
├── volumetric/
│   ├── VolumetricExporter.ts
│   ├── GaussianSplatEncoder.ts
│   ├── GaussianSplatDecoder.ts
│   └── VolumetricStreamer.ts
└── index.ts

packages/cli/src/commands/
├── export.ts
├── render.ts
└── analyze.ts
```

---

## Test Strategy

### Unit Tests (Target: 350+)

| Module              | Test Focus                       | Target |
| ------------------- | -------------------------------- | ------ |
| SceneSerializer     | Round-trip, binary, large graphs | 40     |
| GLTFExporter        | Format compliance, compression   | 60     |
| USDExporter         | Apple compatibility, materials   | 50     |
| AssetOptimizer      | Simplification, atlasing, LOD    | 45     |
| RenderNetworkClient | API, jobs, streaming             | 35     |
| MobileARExporter    | Platform targets, anchors        | 40     |
| VolumetricExporter  | Splat encoding, streaming        | 50     |
| ExportPipeline      | CLI, batch, events               | 35     |

### Integration Tests

- Export → glTF Validator → pass
- Export → Apple Reality Composer → load
- Export → Quest Developer Hub → deploy
- Export → Render Network → render → download

---

## Dependencies

### New Dependencies

| Package                | Purpose                | License    |
| ---------------------- | ---------------------- | ---------- |
| `@gltf-transform/core` | GLTF manipulation      | MIT        |
| `draco3d`              | Mesh compression       | Apache-2.0 |
| `meshoptimizer`        | Mesh optimization      | MIT        |
| `@pixiv/three-vrm`     | Avatar export (future) | MIT        |

### External Services

| Service        | Purpose                  | Cost Model     |
| -------------- | ------------------------ | -------------- |
| Render Network | Distributed rendering    | Credits/GPU-hr |
| IPFS           | Asset hosting (optional) | Per GB         |

---

## Timeline

| Week  | Focus               | Deliverable               |
| ----- | ------------------- | ------------------------- |
| 1-2   | Scene Serialization | SceneSerializer, IR types |
| 3-5   | GLB/GLTF Export     | GLTFExporter, compression |
| 6-8   | USD/USDZ Export     | USDExporter, ARKit        |
| 9-10  | Asset Optimization  | Optimizer pipeline        |
| 11-13 | Render Network      | Client, job management    |
| 14-15 | Mobile AR           | Platform-specific exports |
| 16-18 | Volumetric          | Gaussian Splatting        |
| 19-20 | CLI & API           | Export pipeline, CLI      |

**Total Duration**: 20 weeks (Sep 2026 target)

---

## Exit Gate: v3.3 Release

- [ ] All 8 priorities implemented
- [ ] Scene serialization round-trips correctly
- [ ] GLB passes glTF Validator 2.0
- [ ] USDZ opens in Vision Pro
- [ ] Asset optimization reduces size by 50%+
- [ ] Render Network jobs complete successfully
- [ ] Mobile AR loads on iOS/Android
- [ ] Gaussian Splatting renders at 30fps
- [ ] Test coverage ≥ 60%
- [ ] API documentation complete
- [ ] Migration guide from v3.2.x

---

## Risk Register

| Risk                               | Impact | Probability | Mitigation                     |
| ---------------------------------- | ------ | ----------- | ------------------------------ |
| Render Network API changes         | High   | Low         | Abstract client, versioned API |
| Draco/MeshOpt WASM issues          | Medium | Medium      | Native fallbacks, CI testing   |
| Apple USDZ restrictions            | Medium | Medium      | Strict schema validation       |
| Gaussian Splatting format evolving | Low    | High        | Plugin architecture            |
| Large scene memory limits          | High   | Medium      | Streaming serialization        |

---

## Open Questions

1. **Asset Hosting**: Bundle assets in export or upload to IPFS/CDN?
2. **DRM**: Support encrypted exports for commercial content?
3. **Version Control**: Should exports include HoloScript source?
4. **Licensing**: Embed license metadata in exported files?

---

**Previous Sprint:** v3.2 Autonomous Agent Swarms (Complete)  
**Next Milestone:** v4.0 (Q4 2026) - MAS Orchestration & ZKML
