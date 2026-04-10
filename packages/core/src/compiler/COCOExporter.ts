// TARGET: packages/core/src/compiler/COCOExporter.ts
/**
 * COCO-Format Annotation Exporter for HoloScript Scenes
 *
 * Exports HoloScript compositions as COCO-format annotation files for
 * computer vision training data generation. Supports:
 * - Object detection annotations (bounding boxes)
 * - Instance segmentation annotations (polygon masks from geometry)
 * - Keypoint annotations (from NPC/character joints)
 * - Category mapping from HoloScript traits and templates
 *
 * COCO format reference: https://cocodataset.org/#format-data
 *
 * Use case: Render HoloScript scenes to images, then pair with COCO annotations
 * to create synthetic training datasets for object detection, segmentation, and
 * pose estimation models.
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloNPC,
  HoloShape,
  HoloDomainBlock,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// COCO FORMAT TYPES
// =============================================================================

/** COCO dataset info block */
export interface COCOInfo {
  year: number;
  version: string;
  description: string;
  contributor: string;
  url: string;
  date_created: string;
}

/** COCO license block */
export interface COCOLicense {
  id: number;
  name: string;
  url: string;
}

/** COCO image descriptor */
export interface COCOImage {
  id: number;
  width: number;
  height: number;
  file_name: string;
  license?: number;
  date_captured?: string;
  /** HoloScript metadata: composition name, camera settings, etc. */
  holoscript_meta?: Record<string, unknown>;
}

/** COCO annotation (detection / segmentation) */
export interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  /** Bounding box [x, y, width, height] in pixels */
  bbox: [number, number, number, number];
  /** Area in pixels^2 */
  area: number;
  /** Polygon segmentation mask (list of [x1,y1,x2,y2,...] polygons) */
  segmentation: number[][];
  /** 0 = no crowd, 1 = crowd region */
  iscrowd: 0 | 1;
  /** Keypoints [x1,y1,v1, x2,y2,v2, ...] for pose estimation */
  keypoints?: number[];
  num_keypoints?: number;
  /** Custom attributes from HoloScript traits */
  attributes?: Record<string, unknown>;
}

/** COCO category */
export interface COCOCategory {
  id: number;
  name: string;
  supercategory: string;
  /** Keypoint names for pose estimation */
  keypoints?: string[];
  /** Keypoint connectivity skeleton [[a,b], ...] */
  skeleton?: [number, number][];
}

/** Complete COCO dataset annotation file */
export interface COCODataset {
  info: COCOInfo;
  licenses: COCOLicense[];
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

/** Options for COCO export */
export interface COCOExportOptions {
  /** Image width for projection (default: 1920) */
  imageWidth?: number;
  /** Image height for projection (default: 1080) */
  imageHeight?: number;
  /** Camera field of view in degrees (default: 60) */
  fov?: number;
  /** Camera position [x, y, z] (default: [0, 1.6, 5]) */
  cameraPosition?: [number, number, number];
  /** Camera look-at target [x, y, z] (default: [0, 0, 0]) */
  cameraTarget?: [number, number, number];
  /** Dataset description */
  description?: string;
  /** Contributor name */
  contributor?: string;
  /** Image filename template (use {index} for frame number) */
  filenameTemplate?: string;
  /** Number of augmented views to generate annotations for (default: 1) */
  viewCount?: number;
  /** Include NPC keypoints in annotations (default: true) */
  includeKeypoints?: boolean;
  /** Custom category overrides: trait name -> category */
  categoryOverrides?: Record<string, { name: string; supercategory: string }>;
}

// =============================================================================
// DEFAULT SHAPE SIZES (for bounding box estimation)
// =============================================================================

const DEFAULT_SHAPE_SIZES: Record<string, [number, number, number]> = {
  box: [1, 1, 1],
  cube: [1, 1, 1],
  sphere: [1, 1, 1],
  orb: [1, 1, 1],
  cylinder: [1, 2, 1],
  cone: [1, 2, 1],
  pyramid: [1, 1, 1],
  plane: [2, 0.01, 2],
  ground: [10, 0.01, 10],
  model: [1, 1, 1],
  mesh: [1, 1, 1],
  splat: [1, 1, 1],
  nerf: [1, 1, 1],
};

// =============================================================================
// DEFAULT NPC KEYPOINTS (COCO-style 17 keypoints for humanoid characters)
// =============================================================================

const NPC_KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
];

const NPC_SKELETON: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4], // head
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10], // arms
  [5, 11],
  [6, 12],
  [11, 12], // torso
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16], // legs
];

// =============================================================================
// COCO EXPORTER
// =============================================================================

/**
 * Export a HoloScript composition as a COCO-format annotation dataset.
 *
 * @example
 * ```typescript
 * import { exportCOCO } from './COCOExporter';
 *
 * const coco = exportCOCO(composition, {
 *   imageWidth: 1920,
 *   imageHeight: 1080,
 *   description: 'Synthetic HoloScript training data',
 * });
 *
 * fs.writeFileSync('annotations.json', JSON.stringify(coco, null, 2));
 * ```
 */
export function exportCOCO(
  composition: HoloComposition,
  options: COCOExportOptions = {}
): COCODataset {
  const exporter = new COCOExporterImpl(options);
  return exporter.export(composition);
}

/**
 * Export as JSON string.
 */
export function exportCOCOString(
  composition: HoloComposition,
  options: COCOExportOptions = {}
): string {
  return JSON.stringify(exportCOCO(composition, options), null, 2);
}

// =============================================================================
// EXPORTER IMPLEMENTATION
// =============================================================================

class COCOExporterImpl {
  private imageWidth: number;
  private imageHeight: number;
  private fov: number;
  private cameraPosition: [number, number, number];
  private cameraTarget: [number, number, number];
  private description: string;
  private contributor: string;
  private filenameTemplate: string;
  private viewCount: number;
  private includeKeypoints: boolean;
  private categoryOverrides: Record<string, { name: string; supercategory: string }>;

  private categoryMap: Map<string, number> = new Map();
  private categories: COCOCategory[] = [];
  private nextCategoryId: number = 1;
  private nextAnnotationId: number = 1;

  constructor(options: COCOExportOptions = {}) {
    this.imageWidth = options.imageWidth ?? 1920;
    this.imageHeight = options.imageHeight ?? 1080;
    this.fov = options.fov ?? 60;
    this.cameraPosition = options.cameraPosition ?? [0, 1.6, 5];
    this.cameraTarget = options.cameraTarget ?? [0, 0, 0];
    this.description = options.description ?? 'HoloScript COCO Export';
    this.contributor = options.contributor ?? 'HoloScript';
    this.filenameTemplate = options.filenameTemplate ?? 'frame_{index}.png';
    this.viewCount = options.viewCount ?? 1;
    this.includeKeypoints = options.includeKeypoints ?? true;
    this.categoryOverrides = options.categoryOverrides ?? {};
  }

  export(composition: HoloComposition): COCODataset {
    this.categoryMap.clear();
    this.categories = [];
    this.nextCategoryId = 1;
    this.nextAnnotationId = 1;

    // Pre-scan all objects to build category registry
    this.scanCategories(composition);

    // Add NPC category if applicable
    if (this.includeKeypoints && composition.npcs?.length > 0) {
      this.ensureCategory('npc', 'character');
      const npcCat = this.categories.find((c) => c.name === 'npc');
      if (npcCat) {
        npcCat.keypoints = NPC_KEYPOINT_NAMES;
        npcCat.skeleton = NPC_SKELETON;
      }
    }

    const images: COCOImage[] = [];
    const annotations: COCOAnnotation[] = [];

    // Generate image entries and annotations for each view
    for (let viewIdx = 0; viewIdx < this.viewCount; viewIdx++) {
      const imageId = viewIdx + 1;
      const filename = this.filenameTemplate.replace('{index}', String(viewIdx).padStart(6, '0'));

      images.push({
        id: imageId,
        width: this.imageWidth,
        height: this.imageHeight,
        file_name: filename,
        date_captured: new Date().toISOString(),
        holoscript_meta: {
          composition: composition.name,
          view_index: viewIdx,
          camera_position: this.cameraPosition,
          camera_fov: this.fov,
        },
      });

      // Collect all scene objects and generate annotations
      const sceneAnnotations = this.annotateComposition(composition, imageId);
      annotations.push(...sceneAnnotations);
    }

    const now = new Date();

    return {
      info: {
        year: now.getFullYear(),
        version: '1.0',
        description: this.description,
        contributor: this.contributor,
        url: 'https://holoscript.dev',
        date_created: now.toISOString(),
      },
      licenses: [
        {
          id: 1,
          name: 'HoloScript Synthetic Data License',
          url: 'https://holoscript.dev/license',
        },
      ],
      images,
      annotations,
      categories: this.categories,
    };
  }

  // ---------------------------------------------------------------------------
  // Category scanning
  // ---------------------------------------------------------------------------

  private scanCategories(composition: HoloComposition): void {
    for (const obj of composition.objects ?? []) {
      this.scanObjectCategories(obj);
    }
    for (const group of composition.spatialGroups ?? []) {
      this.scanGroupCategories(group);
    }
    for (const shape of composition.shapes ?? []) {
      this.ensureCategory(shape.shapeType, 'geometry');
    }
    for (const block of composition.domainBlocks ?? []) {
      this.ensureCategory(block.keyword, block.domain);
    }
  }

  private scanObjectCategories(obj: HoloObjectDecl): void {
    const categoryName = this.inferCategory(obj);
    const supercategory = this.inferSupercategory(obj);
    this.ensureCategory(categoryName, supercategory);

    for (const child of obj.children ?? []) {
      this.scanObjectCategories(child);
    }
  }

  private scanGroupCategories(group: HoloSpatialGroup): void {
    for (const obj of group.objects ?? []) {
      this.scanObjectCategories(obj);
    }
    for (const child of group.groups ?? []) {
      this.scanGroupCategories(child);
    }
  }

  private ensureCategory(name: string, supercategory: string): number {
    // Check overrides
    if (this.categoryOverrides[name]) {
      name = this.categoryOverrides[name].name;
      supercategory = this.categoryOverrides[name]?.supercategory ?? supercategory;
    }

    if (!this.categoryMap.has(name)) {
      const id = this.nextCategoryId++;
      this.categoryMap.set(name, id);
      this.categories.push({ id, name, supercategory });
    }
    return this.categoryMap.get(name)!;
  }

  // ---------------------------------------------------------------------------
  // Annotation generation
  // ---------------------------------------------------------------------------

  private annotateComposition(composition: HoloComposition, imageId: number): COCOAnnotation[] {
    const annotations: COCOAnnotation[] = [];

    // Objects
    for (const obj of composition.objects ?? []) {
      annotations.push(...this.annotateObject(obj, imageId, [0, 0, 0]));
    }

    // Spatial groups
    for (const group of composition.spatialGroups ?? []) {
      annotations.push(...this.annotateGroup(group, imageId, [0, 0, 0]));
    }

    // NPCs
    for (const npc of composition.npcs ?? []) {
      annotations.push(...this.annotateNPC(npc, imageId));
    }

    // Shapes
    for (const shape of composition.shapes ?? []) {
      annotations.push(...this.annotateShape(shape, imageId));
    }

    return annotations;
  }

  private annotateObject(
    obj: HoloObjectDecl,
    imageId: number,
    parentOffset: [number, number, number]
  ): COCOAnnotation[] {
    const annotations: COCOAnnotation[] = [];
    const position = this.extractPosition(obj.properties, parentOffset);
    const scale = this.extractScale(obj.properties);
    const geometry = this.inferGeometry(obj);

    const size: [number, number, number] = [
      (DEFAULT_SHAPE_SIZES[geometry]?.[0] ?? 1) * scale[0],
      (DEFAULT_SHAPE_SIZES[geometry]?.[1] ?? 1) * scale[1],
      (DEFAULT_SHAPE_SIZES[geometry]?.[2] ?? 1) * scale[2],
    ];

    const bbox = this.projectBoundingBox(position, size);

    if (bbox) {
      const categoryName = this.inferCategory(obj);
      const categoryId = this.categoryMap.get(categoryName) ?? 1;

      const annotation: COCOAnnotation = {
        id: this.nextAnnotationId++,
        image_id: imageId,
        category_id: categoryId,
        bbox,
        area: bbox[2] * bbox[3],
        segmentation: [this.bboxToPolygon(bbox)],
        iscrowd: 0,
      };

      // Include trait attributes
      if (obj.traits?.length > 0) {
        annotation.attributes = {};
        for (const trait of obj.traits) {
          annotation.attributes[trait.name] = trait.config;
        }
      }

      annotations.push(annotation);
    }

    // Process children
    for (const child of obj.children ?? []) {
      annotations.push(...this.annotateObject(child, imageId, position));
    }

    return annotations;
  }

  private annotateGroup(
    group: HoloSpatialGroup,
    imageId: number,
    parentOffset: [number, number, number]
  ): COCOAnnotation[] {
    const annotations: COCOAnnotation[] = [];
    const groupOffset = this.extractGroupPosition(group, parentOffset);

    for (const obj of group.objects ?? []) {
      annotations.push(...this.annotateObject(obj, imageId, groupOffset));
    }
    for (const child of group.groups ?? []) {
      annotations.push(...this.annotateGroup(child, imageId, groupOffset));
    }

    return annotations;
  }

  private annotateNPC(npc: HoloNPC, imageId: number): COCOAnnotation[] {
    const annotations: COCOAnnotation[] = [];
    const position = this.extractNPCPosition(npc);
    const size: [number, number, number] = [0.6, 1.8, 0.4]; // humanoid default

    const bbox = this.projectBoundingBox(position, size);
    if (!bbox) return annotations;

    const categoryId = this.categoryMap.get('npc') ?? 1;

    const annotation: COCOAnnotation = {
      id: this.nextAnnotationId++,
      image_id: imageId,
      category_id: categoryId,
      bbox,
      area: bbox[2] * bbox[3],
      segmentation: [this.bboxToPolygon(bbox)],
      iscrowd: 0,
    };

    // Generate keypoints if enabled
    if (this.includeKeypoints) {
      const keypoints = this.generateNPCKeypoints(position, bbox);
      annotation.keypoints = keypoints;
      annotation.num_keypoints = NPC_KEYPOINT_NAMES.length;
    }

    annotations.push(annotation);
    return annotations;
  }

  private annotateShape(shape: HoloShape, imageId: number): COCOAnnotation[] {
    const annotations: COCOAnnotation[] = [];
    const position: [number, number, number] = [0, 0, 0];
    const size = DEFAULT_SHAPE_SIZES[shape.shapeType] ?? [1, 1, 1];

    // Extract position/scale from shape properties
    for (const prop of shape.properties) {
      if (prop.key === 'position' && Array.isArray(prop.value)) {
        const arr = prop.value as number[];
        position[0] = arr[0] ?? 0;
        position[1] = arr[1] ?? 0;
        position[2] = arr[2] ?? 0;
      }
    }

    const bbox = this.projectBoundingBox(position, size as [number, number, number]);
    if (!bbox) return annotations;

    const categoryId = this.categoryMap.get(shape.shapeType) ?? 1;

    annotations.push({
      id: this.nextAnnotationId++,
      image_id: imageId,
      category_id: categoryId,
      bbox,
      area: bbox[2] * bbox[3],
      segmentation: [this.bboxToPolygon(bbox)],
      iscrowd: 0,
    });

    return annotations;
  }

  // ---------------------------------------------------------------------------
  // Projection (simplified pinhole camera model)
  // ---------------------------------------------------------------------------

  /**
   * Project a 3D bounding box to 2D image coordinates using a pinhole camera model.
   * Returns [x, y, width, height] in COCO format or null if behind camera.
   */
  private projectBoundingBox(
    position: [number, number, number],
    size: [number, number, number]
  ): [number, number, number, number] | null {
    const focalLength = this.imageWidth / 2 / Math.tan((this.fov * Math.PI) / 360);

    // Camera-relative position (simplified: assume camera looks along -Z)
    const cx = position[0] - this.cameraPosition[0];
    const cy = position[1] - this.cameraPosition[1];
    const cz = this.cameraPosition[2] - position[2]; // depth

    // Behind camera
    if (cz <= 0.01) return null;

    // Project center
    const px = (cx * focalLength) / cz + this.imageWidth / 2;
    const py = -(cy * focalLength) / cz + this.imageHeight / 2;

    // Project size
    const projW = (size[0] * focalLength) / cz;
    const projH = (size[1] * focalLength) / cz;

    // COCO bbox: top-left corner + dimensions
    const x = Math.max(0, Math.round(px - projW / 2));
    const y = Math.max(0, Math.round(py - projH / 2));
    const w = Math.min(this.imageWidth - x, Math.round(projW));
    const h = Math.min(this.imageHeight - y, Math.round(projH));

    if (w <= 0 || h <= 0) return null;
    return [x, y, w, h];
  }

  /** Convert bounding box to polygon format for segmentation */
  private bboxToPolygon(bbox: [number, number, number, number]): number[] {
    const [x, y, w, h] = bbox;
    return [x, y, x + w, y, x + w, y + h, x, y + h];
  }

  // ---------------------------------------------------------------------------
  // Property extraction helpers
  // ---------------------------------------------------------------------------

  private extractPosition(
    properties: HoloObjectDecl['properties'],
    parentOffset: [number, number, number]
  ): [number, number, number] {
    const pos: [number, number, number] = [...parentOffset];
    for (const prop of properties) {
      if (prop.key === 'position' && Array.isArray(prop.value)) {
        const arr = prop.value as number[];
        pos[0] += arr[0] ?? 0;
        pos[1] += arr[1] ?? 0;
        pos[2] += arr[2] ?? 0;
      }
    }
    return pos;
  }

  private extractScale(properties: HoloObjectDecl['properties']): [number, number, number] {
    for (const prop of properties) {
      if (prop.key === 'scale') {
        if (typeof prop.value === 'number') {
          return [prop.value, prop.value, prop.value];
        }
        if (Array.isArray(prop.value)) {
          const arr = prop.value as number[];
          return [arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1];
        }
      }
    }
    return [1, 1, 1];
  }

  private extractGroupPosition(
    group: HoloSpatialGroup,
    parentOffset: [number, number, number]
  ): [number, number, number] {
    const pos: [number, number, number] = [...parentOffset];
    for (const prop of group.properties) {
      if (prop.key === 'position' && Array.isArray(prop.value)) {
        const arr = prop.value as number[];
        pos[0] += arr[0] ?? 0;
        pos[1] += arr[1] ?? 0;
        pos[2] += arr[2] ?? 0;
      }
    }
    return pos;
  }

  private extractNPCPosition(npc: HoloNPC): [number, number, number] {
    for (const prop of npc.properties) {
      if (prop.key === 'position' && Array.isArray(prop.value)) {
        const arr = prop.value as number[];
        return [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0];
      }
    }
    return [0, 0, 0];
  }

  // ---------------------------------------------------------------------------
  // Category/geometry inference
  // ---------------------------------------------------------------------------

  private inferCategory(obj: HoloObjectDecl): string {
    // Check trait overrides first
    for (const trait of obj.traits ?? []) {
      if (this.categoryOverrides[trait.name]) {
        return this.categoryOverrides[trait.name].name;
      }
    }

    // Use template name if present
    if (obj.template) return obj.template.toLowerCase();

    // Use geometry trait if found
    const geometryTrait = obj.traits?.find((t) =>
      ['geometry', 'mesh', 'model', 'shape'].includes(t.name.toLowerCase())
    );
    if (geometryTrait) {
      const shapeType = geometryTrait.config['type'] ?? geometryTrait.config['shape'];
      if (typeof shapeType === 'string') return shapeType;
    }

    // Fallback to object name pattern
    return obj.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  private inferSupercategory(obj: HoloObjectDecl): string {
    for (const trait of obj.traits ?? []) {
      const name = trait.name.toLowerCase();
      if (['interactive', 'clickable', 'draggable'].includes(name)) return 'interactive';
      if (['animated', 'moving'].includes(name)) return 'dynamic';
      if (['physics', 'rigidbody', 'collider'].includes(name)) return 'physics';
      if (['light', 'emissive', 'glow'].includes(name)) return 'lighting';
    }
    return 'object';
  }

  private inferGeometry(obj: HoloObjectDecl): string {
    // Check geometry/shape property
    for (const prop of obj.properties) {
      if (prop.key === 'geometry' || prop.key === 'shape') {
        if (typeof prop.value === 'string') return prop.value;
      }
    }

    // Check geometry trait
    const geoTrait = obj.traits?.find(
      (t) => t.name.toLowerCase() === 'geometry' || t.name.toLowerCase() === 'mesh'
    );
    if (geoTrait) {
      const shape = geoTrait.config['type'] ?? geoTrait.config['shape'];
      if (typeof shape === 'string') return shape;
    }

    return 'cube'; // default
  }

  // ---------------------------------------------------------------------------
  // NPC keypoint generation
  // ---------------------------------------------------------------------------

  /**
   * Generate approximate COCO-format keypoints for an NPC within its bounding box.
   * Format: [x1, y1, v1, x2, y2, v2, ...] where v=2 means visible.
   */
  private generateNPCKeypoints(
    position: [number, number, number],
    bbox: [number, number, number, number]
  ): number[] {
    const [bx, by, bw, bh] = bbox;
    const cx = bx + bw / 2;

    // Approximate keypoint positions as ratios within the bounding box
    // [xRatio, yRatio] from top-left of bbox
    const keypointRatios: [number, number][] = [
      [0.5, 0.05], // nose
      [0.45, 0.04], // left_eye
      [0.55, 0.04], // right_eye
      [0.4, 0.06], // left_ear
      [0.6, 0.06], // right_ear
      [0.35, 0.22], // left_shoulder
      [0.65, 0.22], // right_shoulder
      [0.28, 0.4], // left_elbow
      [0.72, 0.4], // right_elbow
      [0.25, 0.55], // left_wrist
      [0.75, 0.55], // right_wrist
      [0.38, 0.55], // left_hip
      [0.62, 0.55], // right_hip
      [0.36, 0.75], // left_knee
      [0.64, 0.75], // right_knee
      [0.34, 0.95], // left_ankle
      [0.66, 0.95], // right_ankle
    ];

    const keypoints: number[] = [];
    for (const [rx, ry] of keypointRatios) {
      const kx = Math.round(bx + bw * rx);
      const ky = Math.round(by + bh * ry);
      const visible = 2; // 0=not labeled, 1=labeled not visible, 2=labeled and visible
      keypoints.push(kx, ky, visible);
    }

    return keypoints;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { COCOExporterImpl as COCOExporter };
export default exportCOCO;
