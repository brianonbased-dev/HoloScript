import type { Vector3 } from '../types';
/**
 * HoloScript -> OpenXR Spatial Entities Export Compiler
 *
 * Translates a HoloComposition AST into OpenXR spatial entity persistence
 * format (JSON) for vendor-neutral spatial anchor storage.
 *
 * Conforms to:
 *   - XR_FB_spatial_entity_storage (Meta/Facebook spatial entity persistence)
 *   - XR_ANDROID_device_anchor_persistence (Android XR anchor persistence)
 *   - OpenXR spatial entity component model (XrSpatialEntity with components)
 *
 * Maps HoloScript constructs to spatial entities:
 *   - Objects       -> XrSpatialEntity with XrPosef transform + mesh component
 *   - Spatial Groups -> XrSpace hierarchies (parent-child relationships)
 *   - Zones         -> XrSpatialEntity with XrSpatialBounds + semantic labels
 *   - Waypoints     -> XrSpatialAnchor with persistence enabled
 *   - Annotations   -> XrSpatialEntity with semantic label + 2D bounds components
 *
 * Optionally includes WGS84 geospatial metadata as extension data when
 * composition objects carry lat/lon/alt properties.
 *
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloZone,
  HoloWaypoints,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// Output Schema Types
// =============================================================================

/**
 * Orientation quaternion (x, y, z, w) matching XrQuaternionf.
 */
export interface XrQuaternionf {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * 3D position vector matching XrVector3f.
 */
export interface XrVector3f {
  x: number;
  y: number;
  z: number;
}

/**
 * Combined position + orientation matching XrPosef.
 */
export interface XrPosef {
  position: XrVector3f;
  orientation: XrQuaternionf;
}

/**
 * 3D extent for bounding volumes.
 */
export interface XrExtent3Df {
  width: number;
  height: number;
  depth: number;
}

/**
 * 2D extent for annotation bounds.
 */
export interface XrExtent2Df {
  width: number;
  height: number;
}

/**
 * Spatial bounds component for zone entities.
 */
export interface SpatialBoundsComponent {
  type: 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_3D';
  extent: XrExtent3Df;
}

/**
 * Semantic label component for categorizing entities.
 */
export interface SemanticLabelComponent {
  type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL';
  labels: string[];
}

/**
 * 2D bounds component for annotations/text overlays.
 */
export interface Bounds2DComponent {
  type: 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_2D';
  extent: XrExtent2Df;
}

/**
 * Mesh reference component for entities with geometry.
 */
export interface MeshComponent {
  type: 'XR_SPATIAL_COMPONENT_TYPE_TRIANGLE_MESH';
  meshType: string;
  meshRef?: string;
}

/**
 * Persistence state following XR_FB_spatial_entity_storage.
 */
export interface PersistenceComponent {
  type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE';
  storageLocation:
    | 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_LOCAL'
    | 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_CLOUD';
  persisted: boolean;
}

/**
 * Anchor component for anchor-type entities.
 */
export interface AnchorComponent {
  type: 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE';
  anchorType: 'spatial-anchor' | 'device-anchor';
  /** XR_ANDROID_device_anchor_persistence UUID */
  persistenceId?: string;
}

/**
 * Geospatial extension data (WGS84 coordinates).
 */
export interface GeospatialExtension {
  extensionName: 'XR_EXT_geospatial';
  coordinateSystem: 'WGS84';
  latitude: number;
  longitude: number;
  altitude: number;
}

/**
 * Union of all component types.
 */
export type SpatialEntityComponent =
  | SpatialBoundsComponent
  | SemanticLabelComponent
  | Bounds2DComponent
  | MeshComponent
  | PersistenceComponent
  | AnchorComponent;

/**
 * A single spatial entity in the export.
 */
export interface SpatialEntity {
  /** Unique entity UUID */
  entityId: string;
  /** Human-readable name from HoloScript source */
  name: string;
  /** Entity category */
  entityType: 'object' | 'group' | 'zone' | 'waypoint' | 'annotation';
  /** Pose in reference space */
  pose: XrPosef;
  /** Parent entity ID for hierarchy (null = root) */
  parentId: string | null;
  /** Component data attached to this entity */
  components: SpatialEntityComponent[];
  /** Extension data (e.g. geospatial) */
  extensions?: GeospatialExtension[];
  /** Custom properties from HoloScript */
  metadata?: Record<string, unknown>;
}

/**
 * Top-level export document.
 */
export interface SpatialEntitiesDocument {
  /** Schema identifier */
  schema: 'openxr-spatial-entities/1.0';
  /** OpenXR extensions referenced */
  requiredExtensions: string[];
  /** Source composition name */
  compositionName: string;
  /** Reference space type */
  referenceSpaceType:
    | 'XR_REFERENCE_SPACE_TYPE_LOCAL'
    | 'XR_REFERENCE_SPACE_TYPE_STAGE'
    | 'XR_REFERENCE_SPACE_TYPE_UNBOUNDED';
  /** Persistence storage backend */
  storageBackend: 'XR_FB_spatial_entity_storage' | 'XR_ANDROID_device_anchor_persistence';
  /** All spatial entities */
  entities: SpatialEntity[];
  /** Export timestamp (ISO 8601) */
  exportedAt: string;
  /** Generator metadata */
  generator: {
    name: string;
    version: string;
  };
}

// =============================================================================
// Compiler Options
// =============================================================================

export interface OpenXRSpatialEntitiesCompilerOptions {
  /**
   * Reference space type for the exported scene.
   * @default 'XR_REFERENCE_SPACE_TYPE_STAGE'
   */
  referenceSpaceType?:
    | 'XR_REFERENCE_SPACE_TYPE_LOCAL'
    | 'XR_REFERENCE_SPACE_TYPE_STAGE'
    | 'XR_REFERENCE_SPACE_TYPE_UNBOUNDED';

  /**
   * Storage backend for persistence.
   * @default 'XR_FB_spatial_entity_storage'
   */
  storageBackend?: 'XR_FB_spatial_entity_storage' | 'XR_ANDROID_device_anchor_persistence';

  /**
   * Default persistence storage location.
   * @default 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_LOCAL'
   */
  storageLocation?:
    | 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_LOCAL'
    | 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_CLOUD';

  /**
   * Whether to include geospatial metadata when objects have lat/lon/alt.
   * @default true
   */
  includeGeospatial?: boolean;

  /**
   * JSON output indentation (spaces). Set to 0 for minified output.
   * @default 2
   */
  jsonIndent?: number;
}

// =============================================================================
// Compiler Implementation
// =============================================================================

export class OpenXRSpatialEntitiesCompiler extends CompilerBase {
  protected readonly compilerName = 'OpenXRSpatialEntitiesCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.OPENXR_SPATIAL_ENTITIES;
  }

  private options: Required<OpenXRSpatialEntitiesCompilerOptions>;
  private entities: SpatialEntity[] = [];
  private entityCounter = 0;
  private requiredExtensions: Set<string> = new Set();

  constructor(options: OpenXRSpatialEntitiesCompilerOptions = {}) {
    super();
    this.options = {
      referenceSpaceType: options.referenceSpaceType ?? 'XR_REFERENCE_SPACE_TYPE_STAGE',
      storageBackend: options.storageBackend ?? 'XR_FB_spatial_entity_storage',
      storageLocation: options.storageLocation ?? 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_LOCAL',
      includeGeospatial: options.includeGeospatial ?? true,
      jsonIndent: options.jsonIndent ?? 2,
    };
  }

  /**
   * Compile a HoloComposition to OpenXR spatial entity persistence JSON.
   *
   * @param composition - HoloScript AST
   * @param agentToken - JWT or UCAN token for RBAC validation
   * @param outputPath - Optional output file path for scope validation
   * @returns JSON string conforming to SpatialEntitiesDocument
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    // Reset state
    this.entities = [];
    this.entityCounter = 0;
    this.requiredExtensions = new Set();

    // Always require the base spatial entity extension
    this.requiredExtensions.add('XR_FB_spatial_entity');

    // Add storage extension based on backend
    if (this.options.storageBackend === 'XR_FB_spatial_entity_storage') {
      this.requiredExtensions.add('XR_FB_spatial_entity_storage');
    } else {
      this.requiredExtensions.add('XR_ANDROID_device_anchor_persistence');
    }

    // Process composition elements
    this.processObjects(composition.objects, null);
    this.processSpatialGroups(composition.spatialGroups, null);
    this.processZones(composition.zones, null);
    this.processWaypoints(composition.waypointSets, null);
    this.processAnnotations(composition, null);

    // Build document
    const document: SpatialEntitiesDocument = {
      schema: 'openxr-spatial-entities/1.0',
      requiredExtensions: [...this.requiredExtensions].sort(),
      compositionName: composition.name,
      referenceSpaceType: this.options.referenceSpaceType,
      storageBackend: this.options.storageBackend,
      entities: this.entities,
      exportedAt: new Date().toISOString(),
      generator: {
        name: 'HoloScript OpenXRSpatialEntitiesCompiler',
        version: '1.0.0',
      },
    };

    return JSON.stringify(document, null, this.options.jsonIndent || undefined);
  }

  // ===========================================================================
  // Entity ID generation
  // ===========================================================================

  private generateEntityId(prefix: string): string {
    this.entityCounter++;
    // Generate a deterministic UUID-like ID from prefix + counter
    const hash = this.simpleHash(`${prefix}-${this.entityCounter}`);
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    // Convert to a 32-char hex string (padded)
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    // Repeat to fill 32 chars
    return (hex + hex + hex + hex).slice(0, 32);
  }

  // ===========================================================================
  // Object processing
  // ===========================================================================

  private processObjects(objects: HoloObjectDecl[] | undefined, parentId: string | null): void {
    if (!objects) return;
    for (const obj of objects) {
      this.processObject(obj, parentId);
    }
  }

  private processObject(obj: HoloObjectDecl, parentId: string | null): void {
    const entityId = this.generateEntityId(
      `obj-${this.escapeStringValue(obj.name as string, 'TypeScript')}`
    );

    const position = this.extractPosition(obj);
    const rotation = this.extractRotation(obj);
    const pose = this.buildPose(position, rotation);

    const components: SpatialEntityComponent[] = [];

    // Mesh component
    const meshType =
      this.findProp(obj.properties, 'mesh') || this.findProp(obj.properties, 'type') || 'cube';
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_TRIANGLE_MESH',
      meshType: String(meshType),
      meshRef: typeof obj.template === 'string' ? obj.template : undefined,
    });

    // Persistence component
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
      storageLocation: this.options.storageLocation,
      persisted: true,
    });

    // Anchor component if object has anchor trait
    const hasAnchorTrait = obj.traits?.some(
      (t) => t.name === 'anchor' || t.name === 'persistent_anchor' || t.name === 'shared_anchor'
    );
    if (hasAnchorTrait) {
      components.push({
        type: 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE',
        anchorType:
          this.options.storageBackend === 'XR_ANDROID_device_anchor_persistence'
            ? 'device-anchor'
            : 'spatial-anchor',
        persistenceId: entityId,
      });
    }

    // Semantic labels from traits
    const labels = this.extractSemanticLabels(obj);
    if (labels.length > 0) {
      this.requiredExtensions.add('XR_FB_spatial_entity_query');
      components.push({
        type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
        labels,
      });
    }

    // Geospatial extension
    const extensions: GeospatialExtension[] = [];
    if (this.options.includeGeospatial) {
      const geo = this.extractGeospatial(obj);
      if (geo) {
        this.requiredExtensions.add('XR_EXT_geospatial');
        extensions.push(geo);
      }
    }

    // Collect metadata (non-standard properties)
    const metadata = this.extractMetadata(obj);

    const entity: SpatialEntity = {
      entityId,
      name: obj.name,
      entityType: 'object',
      pose,
      parentId,
      components,
      ...(extensions.length > 0 ? { extensions } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };

    this.entities.push(entity);

    // Recurse children
    if (obj.children) {
      this.processObjects(obj.children, entityId);
    }
  }

  // ===========================================================================
  // Spatial group processing
  // ===========================================================================

  private processSpatialGroups(
    groups: HoloSpatialGroup[] | undefined,
    parentId: string | null
  ): void {
    if (!groups) return;
    for (const group of groups) {
      this.processSpatialGroup(group, parentId);
    }
  }

  private processSpatialGroup(group: HoloSpatialGroup, parentId: string | null): void {
    const entityId = this.generateEntityId(
      `grp-${this.escapeStringValue(group.name as string, 'TypeScript')}`
    );

    const position = this.extractGroupPosition(group);
    const rotation = this.extractGroupRotation(group);
    const pose = this.buildPose(position, rotation);

    const components: SpatialEntityComponent[] = [];

    // Groups are locatable spaces
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE',
      anchorType: 'spatial-anchor',
    });

    // Persistence
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
      storageLocation: this.options.storageLocation,
      persisted: true,
    });

    // Semantic label for the group
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
      labels: ['spatial-group', this.sanitizeName(group.name)],
    });

    const entity: SpatialEntity = {
      entityId,
      name: group.name,
      entityType: 'group',
      pose,
      parentId,
      components,
    };

    this.entities.push(entity);

    // Process child objects under this group
    this.processObjects(group.objects, entityId);

    // Process nested groups
    if (group.groups) {
      this.processSpatialGroups(group.groups, entityId);
    }
  }

  // ===========================================================================
  // Zone processing
  // ===========================================================================

  private processZones(zones: HoloZone[] | undefined, parentId: string | null): void {
    if (!zones) return;
    for (const zone of zones) {
      this.processZone(zone, parentId);
    }
  }

  private processZone(zone: HoloZone, parentId: string | null): void {
    const entityId = this.generateEntityId(
      `zone-${this.escapeStringValue(zone.name as string, 'TypeScript')}`
    );

    const position = this.extractZonePosition(zone);
    const pose = this.buildPose(position, [0, 0, 0]);

    const components: SpatialEntityComponent[] = [];

    // Extract bounds from zone properties
    const bounds = this.extractZoneBounds(zone);
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_3D',
      extent: bounds,
    });

    // Semantic labels for the zone
    const zoneType =
      this.findZoneProp(zone, 'type') || this.findZoneProp(zone, 'zone_type') || 'trigger';
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
      labels: ['zone', String(zoneType), this.sanitizeName(zone.name)],
    });

    // Persistence
    components.push({
      type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
      storageLocation: this.options.storageLocation,
      persisted: true,
    });

    const entity: SpatialEntity = {
      entityId,
      name: zone.name,
      entityType: 'zone',
      pose,
      parentId,
      components,
    };

    this.entities.push(entity);
  }

  // ===========================================================================
  // Waypoint processing
  // ===========================================================================

  private processWaypoints(
    waypointSets: HoloWaypoints[] | undefined,
    parentId: string | null
  ): void {
    if (!waypointSets) return;
    for (const wpSet of waypointSets) {
      this.processWaypointSet(wpSet, parentId);
    }
  }

  private processWaypointSet(wpSet: HoloWaypoints, parentId: string | null): void {
    // Create a group entity for the waypoint set
    const groupEntityId = this.generateEntityId(
      `wp-set-${this.escapeStringValue(wpSet.name as string, 'TypeScript')}`
    );
    const groupEntity: SpatialEntity = {
      entityId: groupEntityId,
      name: wpSet.name,
      entityType: 'group',
      pose: this.buildPose([0, 0, 0], [0, 0, 0]),
      parentId,
      components: [
        {
          type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
          labels: ['waypoint-set', this.sanitizeName(wpSet.name)],
        },
        {
          type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
          storageLocation: this.options.storageLocation,
          persisted: true,
        },
      ],
    };
    this.entities.push(groupEntity);

    // Process individual waypoints
    const points = wpSet.points;
    if (Array.isArray(points)) {
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const position = this.toNumberArray(point);
        const entityId = this.generateEntityId(
          `wp-${this.escapeStringValue(wpSet.name as string, 'TypeScript')}-${i}`
        );

        const components: SpatialEntityComponent[] = [];

        // Waypoints are anchors with persistence
        components.push({
          type: 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE',
          anchorType:
            this.options.storageBackend === 'XR_ANDROID_device_anchor_persistence'
              ? 'device-anchor'
              : 'spatial-anchor',
          persistenceId: entityId,
        });

        components.push({
          type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
          storageLocation: this.options.storageLocation,
          persisted: true,
        });

        components.push({
          type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
          labels: [
            'waypoint',
            `${this.escapeStringValue(wpSet.name as string, 'TypeScript')}-${i}`,
          ],
        });

        const entity: SpatialEntity = {
          entityId,
          name: `${this.escapeStringValue(wpSet.name as string, 'TypeScript')}_waypoint_${i}`,
          entityType: 'waypoint',
          pose: this.buildPose(position, [0, 0, 0]),
          parentId: groupEntityId,
          components,
        };

        this.entities.push(entity);
      }
    }
  }

  // ===========================================================================
  // Annotation processing (UI elements as spatial annotations)
  // ===========================================================================

  private processAnnotations(composition: HoloComposition, parentId: string | null): void {
    if (!composition.ui?.elements) return;

    for (const uiElement of composition.ui.elements) {
      const entityId = this.generateEntityId(
        `annot-${this.escapeStringValue(uiElement.name as string, 'TypeScript')}`
      );

      // Try to extract position from UI element properties
      const posProp = uiElement.properties.find((p) => p.key === 'position');
      const position =
        posProp && Array.isArray(posProp.value) ? this.toNumberArray(posProp.value) : [0, 0, 0];
      const pose = this.buildPose(position, [0, 0, 0]);

      const components: SpatialEntityComponent[] = [];

      // Semantic label for the annotation
      const labelProp = uiElement.properties.find((p) => p.key === 'label' || p.key === 'text');
      const labelText = labelProp ? String(labelProp.value) : uiElement.name;
      components.push({
        type: 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
        labels: ['annotation', labelText],
      });

      // 2D bounds for text display area
      const widthProp = uiElement.properties.find((p) => p.key === 'width');
      const heightProp = uiElement.properties.find((p) => p.key === 'height');
      components.push({
        type: 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_2D',
        extent: {
          width: typeof widthProp?.value === 'number' ? widthProp.value : 1.0,
          height: typeof heightProp?.value === 'number' ? heightProp.value : 0.5,
        },
      });

      // Persistence
      components.push({
        type: 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
        storageLocation: this.options.storageLocation,
        persisted: true,
      });

      const entity: SpatialEntity = {
        entityId,
        name: uiElement.name,
        entityType: 'annotation',
        pose,
        parentId,
        components,
      };

      this.entities.push(entity);
    }
  }

  // ===========================================================================
  // Property extraction helpers
  // ===========================================================================

  private extractPosition(obj: HoloObjectDecl): number[] {
    const pos = this.findProp(obj.properties, 'position');
    if (Array.isArray(pos)) return this.toNumberArray(pos);
    return [0, 0, 0];
  }

  private extractRotation(obj: HoloObjectDecl): number[] {
    const rot = this.findProp(obj.properties, 'rotation');
    if (Array.isArray(rot)) return this.toNumberArray(rot);
    return [0, 0, 0];
  }

  private extractGroupPosition(group: HoloSpatialGroup): number[] {
    const prop = group.properties.find((p) => p.key === 'position');
    if (prop && Array.isArray(prop.value)) return this.toNumberArray(prop.value);
    return [0, 0, 0];
  }

  private extractGroupRotation(group: HoloSpatialGroup): number[] {
    const prop = group.properties.find((p) => p.key === 'rotation');
    if (prop && Array.isArray(prop.value)) return this.toNumberArray(prop.value);
    return [0, 0, 0];
  }

  private extractZonePosition(zone: HoloZone): number[] {
    const prop = zone.properties.find((p) => p.key === 'position');
    if (prop && Array.isArray(prop.value)) return this.toNumberArray(prop.value);
    return [0, 0, 0];
  }

  private extractZoneBounds(zone: HoloZone): XrExtent3Df {
    const sizeProp = zone.properties.find((p) => p.key === 'size' || p.key === 'bounds');
    if (sizeProp && Array.isArray(sizeProp.value)) {
      const arr = this.toNumberArray(sizeProp.value);
      return { width: arr[0] || 1, height: arr[1] || 1, depth: arr[2] || 1 };
    }
    const radiusProp = zone.properties.find((p) => p.key === 'radius');
    if (radiusProp && typeof radiusProp.value === 'number') {
      const d = radiusProp.value * 2;
      return { width: d, height: d, depth: d };
    }
    return { width: 5, height: 3, depth: 5 };
  }

  private extractSemanticLabels(obj: HoloObjectDecl): string[] {
    const labels: string[] = [];
    if (obj.template) labels.push(obj.template);
    if (obj.traits) {
      for (const trait of obj.traits) {
        labels.push(trait.name);
      }
    }
    const tagProp = this.findProp(obj.properties, 'tag') || this.findProp(obj.properties, 'label');
    if (typeof tagProp === 'string') labels.push(tagProp);
    return labels;
  }

  private extractGeospatial(obj: HoloObjectDecl): GeospatialExtension | null {
    const lat = this.findProp(obj.properties, 'latitude') ?? this.findProp(obj.properties, 'lat');
    const lon = this.findProp(obj.properties, 'longitude') ?? this.findProp(obj.properties, 'lon');
    const alt = this.findProp(obj.properties, 'altitude') ?? this.findProp(obj.properties, 'alt');

    if (typeof lat === 'number' && typeof lon === 'number') {
      return {
        extensionName: 'XR_EXT_geospatial',
        coordinateSystem: 'WGS84',
        latitude: lat,
        longitude: lon,
        altitude: typeof alt === 'number' ? alt : 0,
      };
    }

    return null;
  }

  private extractMetadata(obj: HoloObjectDecl): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};
    const standardKeys = new Set([
      'position',
      'rotation',
      'scale',
      'mesh',
      'type',
      'color',
      'material',
      'latitude',
      'lat',
      'longitude',
      'lon',
      'altitude',
      'alt',
      'tag',
      'label',
    ]);
    for (const prop of obj.properties ?? []) {
      if (!standardKeys.has(prop.key)) {
        metadata[prop.key] = prop.value;
      }
    }
    return metadata;
  }

  // ===========================================================================
  // Pose construction
  // ===========================================================================

  /**
   * Build an XrPosef from position and Euler rotation (degrees).
   * Converts Euler angles to quaternion.
   */
  private buildPose(position: number[], eulerDegrees: number[]): XrPosef {
    const pos: any = [
      position[0] || 0,
      position[1] || 0,
      position[2] || 0,
    ];

    const orientation = this.eulerToQuaternion(
      eulerDegrees[0] || 0,
      eulerDegrees[1] || 0,
      eulerDegrees[2] || 0
    );

    return { position: pos, orientation };
  }

  /**
   * Convert Euler angles (degrees, XYZ order) to quaternion.
   */
  private eulerToQuaternion(xDeg: number, yDeg: number, zDeg: number): XrQuaternionf {
    const toRad = Math.PI / 180;
    const cx = Math.cos((xDeg * toRad) / 2);
    const sx = Math.sin((xDeg * toRad) / 2);
    const cy = Math.cos((yDeg * toRad) / 2);
    const sy = Math.sin((yDeg * toRad) / 2);
    const cz = Math.cos((zDeg * toRad) / 2);
    const sz = Math.sin((zDeg * toRad) / 2);

    const qx = sx * cy * cz - cx * sy * sz;
    const qy = cx * sy * cz + sx * cy * sz;
    const qz = cx * cy * sz - sx * sy * cz;
    const qw = cx * cy * cz + sx * sy * sz;
    return { 0: qx, 1: qy, 2: qz, w: qw } as any;
  }

  // ===========================================================================
  // Generic helpers
  // ===========================================================================

  private findProp(
    properties: { key: string; value: HoloValue }[] | undefined,
    key: string
  ): HoloValue | undefined {
    return properties?.find((p) => p.key === key)?.value;
  }

  private findZoneProp(zone: HoloZone, key: string): HoloValue | undefined {
    return zone.properties.find((p) => p.key === key)?.value;
  }

  private toNumberArray(val: HoloValue): number[] {
    if (Array.isArray(val)) {
      return val.map((v) => (typeof v === 'number' ? v : 0));
    }
    return [0, 0, 0];
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }
}
