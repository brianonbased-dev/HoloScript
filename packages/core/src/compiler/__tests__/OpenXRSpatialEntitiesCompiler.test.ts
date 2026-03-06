import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenXRSpatialEntitiesCompiler } from '../OpenXRSpatialEntitiesCompiler';
import type { SpatialEntitiesDocument } from '../OpenXRSpatialEntitiesCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// ---------------------------------------------------------------------------
// RBAC Mock (W.013: All HoloScript compiler tests need RBAC mock)
// Uses vi.mock with async importOriginal — no vi.hoisted needed here since
// the mock factory doesn't reference any external variables.
// ---------------------------------------------------------------------------
vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal HoloComposition AST for testing.
 */
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    objects: [],
    lights: [],
    spatialGroups: [],
    audio: [],
    timelines: [],
    zones: [],
    templates: [],
    imports: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  } as HoloComposition;
}

/**
 * Compile and parse the JSON result into a typed document.
 */
function compileAndParse(
  compiler: OpenXRSpatialEntitiesCompiler,
  composition: HoloComposition,
): SpatialEntitiesDocument {
  const json = compiler.compile(composition, 'test-token');
  return JSON.parse(json) as SpatialEntitiesDocument;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('OpenXRSpatialEntitiesCompiler', () => {
  let compiler: OpenXRSpatialEntitiesCompiler;

  beforeEach(() => {
    compiler = new OpenXRSpatialEntitiesCompiler();
  });

  // =========================================================================
  // Construction
  // =========================================================================

  describe('construction', () => {
    it('creates with defaults', () => {
      expect(compiler).toBeDefined();
    });

    it('accepts custom options', () => {
      const c = new OpenXRSpatialEntitiesCompiler({
        referenceSpaceType: 'XR_REFERENCE_SPACE_TYPE_LOCAL',
        storageBackend: 'XR_ANDROID_device_anchor_persistence',
        storageLocation: 'XR_SPATIAL_ENTITY_STORAGE_LOCATION_CLOUD',
        includeGeospatial: false,
        jsonIndent: 4,
      });
      expect(c).toBeDefined();
    });
  });

  // =========================================================================
  // Basic Compilation
  // =========================================================================

  describe('basic compilation', () => {
    it('produces valid JSON output', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('includes correct schema version', () => {
      const doc = compileAndParse(compiler, makeComposition());
      expect(doc.schema).toBe('openxr-spatial-entities/1.0');
    });

    it('includes composition name', () => {
      const doc = compileAndParse(compiler, makeComposition({ name: 'MyXRScene' }));
      expect(doc.compositionName).toBe('MyXRScene');
    });

    it('includes default reference space type', () => {
      const doc = compileAndParse(compiler, makeComposition());
      expect(doc.referenceSpaceType).toBe('XR_REFERENCE_SPACE_TYPE_STAGE');
    });

    it('uses custom reference space type', () => {
      const c = new OpenXRSpatialEntitiesCompiler({
        referenceSpaceType: 'XR_REFERENCE_SPACE_TYPE_UNBOUNDED',
      });
      const doc = compileAndParse(c, makeComposition());
      expect(doc.referenceSpaceType).toBe('XR_REFERENCE_SPACE_TYPE_UNBOUNDED');
    });

    it('includes required extensions', () => {
      const doc = compileAndParse(compiler, makeComposition());
      expect(doc.requiredExtensions).toContain('XR_FB_spatial_entity');
      expect(doc.requiredExtensions).toContain('XR_FB_spatial_entity_storage');
    });

    it('includes Android extension when using Android backend', () => {
      const c = new OpenXRSpatialEntitiesCompiler({
        storageBackend: 'XR_ANDROID_device_anchor_persistence',
      });
      const doc = compileAndParse(c, makeComposition());
      expect(doc.requiredExtensions).toContain('XR_ANDROID_device_anchor_persistence');
    });

    it('includes generator metadata', () => {
      const doc = compileAndParse(compiler, makeComposition());
      expect(doc.generator.name).toBe('HoloScript OpenXRSpatialEntitiesCompiler');
      expect(doc.generator.version).toBe('1.0.0');
    });

    it('includes exportedAt timestamp', () => {
      const doc = compileAndParse(compiler, makeComposition());
      expect(doc.exportedAt).toBeDefined();
      // Should be a valid ISO 8601 date
      expect(new Date(doc.exportedAt).getTime()).not.toBeNaN();
    });

    it('produces empty entities array for empty composition', () => {
      const doc = compileAndParse(compiler, makeComposition());
      expect(doc.entities).toEqual([]);
    });
  });

  // =========================================================================
  // Object -> Spatial Entity
  // =========================================================================

  describe('object spatial entities', () => {
    it('creates spatial entity from a simple object', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'MyCube',
          properties: [
            { type: 'ObjectProperty', key: 'mesh', value: 'cube' },
            { type: 'ObjectProperty', key: 'position', value: [1, 2, 3] },
          ],
          traits: [],
        }] as any,
      }));

      expect(doc.entities.length).toBe(1);
      const entity = doc.entities[0];
      expect(entity.name).toBe('MyCube');
      expect(entity.entityType).toBe('object');
      expect(entity.pose.position).toEqual({ x: 1, y: 2, z: 3 });
      expect(entity.parentId).toBeNull();
    });

    it('maps mesh type to triangle mesh component', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'MySphere',
          properties: [
            { type: 'ObjectProperty', key: 'mesh', value: 'sphere' },
          ],
          traits: [],
        }] as any,
      }));

      const meshComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_TRIANGLE_MESH',
      );
      expect(meshComp).toBeDefined();
      expect((meshComp as any).meshType).toBe('sphere');
    });

    it('includes persistence component on all objects', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'Box1',
          properties: [],
          traits: [],
        }] as any,
      }));

      const storableComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_STORABLE',
      );
      expect(storableComp).toBeDefined();
      expect((storableComp as any).persisted).toBe(true);
    });

    it('generates anchor component for objects with anchor trait', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'AnchoredItem',
          properties: [
            { type: 'ObjectProperty', key: 'position', value: [5, 0, -2] },
          ],
          traits: [
            { type: 'ObjectTrait', name: 'anchor', config: {} },
          ],
        }] as any,
      }));

      const anchorComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE',
      );
      expect(anchorComp).toBeDefined();
      expect((anchorComp as any).anchorType).toBe('spatial-anchor');
      expect((anchorComp as any).persistenceId).toBeDefined();
    });

    it('uses device-anchor type for Android backend', () => {
      const c = new OpenXRSpatialEntitiesCompiler({
        storageBackend: 'XR_ANDROID_device_anchor_persistence',
      });
      const doc = compileAndParse(c, makeComposition({
        objects: [{
          type: 'Object',
          name: 'AndroidAnchor',
          properties: [],
          traits: [
            { type: 'ObjectTrait', name: 'persistent_anchor', config: {} },
          ],
        }] as any,
      }));

      const anchorComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE',
      );
      expect((anchorComp as any).anchorType).toBe('device-anchor');
    });

    it('converts Euler rotation to quaternion', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'RotatedObj',
          properties: [
            { type: 'ObjectProperty', key: 'rotation', value: [90, 0, 0] },
          ],
          traits: [],
        }] as any,
      }));

      const q = doc.entities[0].pose.orientation;
      // 90-degree rotation around X axis
      expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
      expect(q.x).toBeCloseTo(Math.sin(Math.PI / 4), 5);
      expect(q.y).toBeCloseTo(0, 5);
      expect(q.z).toBeCloseTo(0, 5);
    });

    it('processes child objects with parent ID', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'Parent',
          properties: [],
          traits: [],
          children: [{
            type: 'Object',
            name: 'Child',
            properties: [],
            traits: [],
          }],
        }] as any,
      }));

      expect(doc.entities.length).toBe(2);
      const parent = doc.entities.find(e => e.name === 'Parent');
      const child = doc.entities.find(e => e.name === 'Child');
      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect(child!.parentId).toBe(parent!.entityId);
    });

    it('extracts semantic labels from traits', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'LabeledObj',
          properties: [],
          traits: [
            { type: 'ObjectTrait', name: 'grabbable', config: {} },
            { type: 'ObjectTrait', name: 'physics', config: {} },
          ],
        }] as any,
      }));

      const labelComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
      );
      expect(labelComp).toBeDefined();
      expect((labelComp as any).labels).toContain('grabbable');
      expect((labelComp as any).labels).toContain('physics');
    });
  });

  // =========================================================================
  // Spatial Groups -> XrSpace Hierarchies
  // =========================================================================

  describe('spatial group entities', () => {
    it('creates group entities from spatial groups', () => {
      const doc = compileAndParse(compiler, makeComposition({
        spatialGroups: [{
          type: 'SpatialGroup',
          name: 'Room1',
          properties: [
            { type: 'GroupProperty', key: 'position', value: [10, 0, 5] },
          ],
          objects: [],
        }] as any,
      }));

      expect(doc.entities.length).toBe(1);
      const entity = doc.entities[0];
      expect(entity.name).toBe('Room1');
      expect(entity.entityType).toBe('group');
      expect(entity.pose.position).toEqual({ x: 10, y: 0, z: 5 });
    });

    it('nests objects under group parent ID', () => {
      const doc = compileAndParse(compiler, makeComposition({
        spatialGroups: [{
          type: 'SpatialGroup',
          name: 'Gallery',
          properties: [],
          objects: [{
            type: 'Object',
            name: 'Painting',
            properties: [],
            traits: [],
          }],
        }] as any,
      }));

      expect(doc.entities.length).toBe(2);
      const group = doc.entities.find(e => e.entityType === 'group');
      const painting = doc.entities.find(e => e.name === 'Painting');
      expect(painting!.parentId).toBe(group!.entityId);
    });

    it('handles nested groups', () => {
      const doc = compileAndParse(compiler, makeComposition({
        spatialGroups: [{
          type: 'SpatialGroup',
          name: 'Building',
          properties: [],
          objects: [],
          groups: [{
            type: 'SpatialGroup',
            name: 'Floor1',
            properties: [],
            objects: [],
          }],
        }] as any,
      }));

      expect(doc.entities.length).toBe(2);
      const building = doc.entities.find(e => e.name === 'Building');
      const floor = doc.entities.find(e => e.name === 'Floor1');
      expect(floor!.parentId).toBe(building!.entityId);
    });
  });

  // =========================================================================
  // Zones -> XrSpatialBounds + Semantic Labels
  // =========================================================================

  describe('zone entities', () => {
    it('creates zone entity with bounds', () => {
      const doc = compileAndParse(compiler, makeComposition({
        zones: [{
          type: 'Zone',
          name: 'EntryZone',
          properties: [
            { type: 'ZoneProperty', key: 'position', value: [0, 0, 0] },
            { type: 'ZoneProperty', key: 'size', value: [10, 3, 10] },
          ],
          handlers: [],
        }] as any,
      }));

      expect(doc.entities.length).toBe(1);
      const entity = doc.entities[0];
      expect(entity.name).toBe('EntryZone');
      expect(entity.entityType).toBe('zone');

      const boundsComp = entity.components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_3D',
      );
      expect(boundsComp).toBeDefined();
      expect((boundsComp as any).extent).toEqual({ width: 10, height: 3, depth: 10 });
    });

    it('includes semantic labels on zones', () => {
      const doc = compileAndParse(compiler, makeComposition({
        zones: [{
          type: 'Zone',
          name: 'SafeZone',
          properties: [
            { type: 'ZoneProperty', key: 'type', value: 'safe' },
          ],
          handlers: [],
        }] as any,
      }));

      const labelComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
      );
      expect(labelComp).toBeDefined();
      expect((labelComp as any).labels).toContain('zone');
      expect((labelComp as any).labels).toContain('safe');
    });

    it('uses radius to compute spherical bounds', () => {
      const doc = compileAndParse(compiler, makeComposition({
        zones: [{
          type: 'Zone',
          name: 'RadiusZone',
          properties: [
            { type: 'ZoneProperty', key: 'radius', value: 5 },
          ],
          handlers: [],
        }] as any,
      }));

      const boundsComp = doc.entities[0].components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_3D',
      );
      expect((boundsComp as any).extent).toEqual({ width: 10, height: 10, depth: 10 });
    });
  });

  // =========================================================================
  // Waypoints -> XrSpatialAnchor with Persistence
  // =========================================================================

  describe('waypoint entities', () => {
    it('creates waypoint entities from waypoint sets', () => {
      const doc = compileAndParse(compiler, makeComposition({
        waypointSets: [{
          type: 'Waypoints',
          name: 'PatrolPath',
          points: [[0, 0, 0], [5, 0, 0], [5, 0, 5]],
        }] as any,
      }));

      // 1 group entity + 3 waypoint entities
      expect(doc.entities.length).toBe(4);
      const waypoints = doc.entities.filter(e => e.entityType === 'waypoint');
      expect(waypoints.length).toBe(3);
    });

    it('positions waypoints correctly', () => {
      const doc = compileAndParse(compiler, makeComposition({
        waypointSets: [{
          type: 'Waypoints',
          name: 'Path',
          points: [[1, 2, 3]],
        }] as any,
      }));

      const wp = doc.entities.find(e => e.entityType === 'waypoint');
      expect(wp).toBeDefined();
      expect(wp!.pose.position).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('includes anchor component with persistence on waypoints', () => {
      const doc = compileAndParse(compiler, makeComposition({
        waypointSets: [{
          type: 'Waypoints',
          name: 'NavPoints',
          points: [[0, 0, 0]],
        }] as any,
      }));

      const wp = doc.entities.find(e => e.entityType === 'waypoint');
      const anchorComp = wp!.components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_LOCATABLE',
      );
      expect(anchorComp).toBeDefined();
      expect((anchorComp as any).persistenceId).toBeDefined();
    });

    it('nests waypoints under group entity', () => {
      const doc = compileAndParse(compiler, makeComposition({
        waypointSets: [{
          type: 'Waypoints',
          name: 'Route',
          points: [[0, 0, 0], [1, 0, 0]],
        }] as any,
      }));

      const group = doc.entities.find(e => e.entityType === 'group');
      const waypoints = doc.entities.filter(e => e.entityType === 'waypoint');
      expect(group).toBeDefined();
      for (const wp of waypoints) {
        expect(wp.parentId).toBe(group!.entityId);
      }
    });
  });

  // =========================================================================
  // Geospatial Metadata
  // =========================================================================

  describe('geospatial metadata', () => {
    it('includes WGS84 extension data when lat/lon are present', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'GeoMarker',
          properties: [
            { type: 'ObjectProperty', key: 'latitude', value: 37.7749 },
            { type: 'ObjectProperty', key: 'longitude', value: -122.4194 },
            { type: 'ObjectProperty', key: 'altitude', value: 10 },
          ],
          traits: [],
        }] as any,
      }));

      const entity = doc.entities[0];
      expect(entity.extensions).toBeDefined();
      expect(entity.extensions!.length).toBe(1);
      const geo = entity.extensions![0];
      expect(geo.extensionName).toBe('XR_EXT_geospatial');
      expect(geo.coordinateSystem).toBe('WGS84');
      expect(geo.latitude).toBe(37.7749);
      expect(geo.longitude).toBe(-122.4194);
      expect(geo.altitude).toBe(10);
    });

    it('adds XR_EXT_geospatial to required extensions', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'GeoObj',
          properties: [
            { type: 'ObjectProperty', key: 'lat', value: 40.0 },
            { type: 'ObjectProperty', key: 'lon', value: -74.0 },
          ],
          traits: [],
        }] as any,
      }));

      expect(doc.requiredExtensions).toContain('XR_EXT_geospatial');
    });

    it('defaults altitude to 0 when not specified', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'FlatMarker',
          properties: [
            { type: 'ObjectProperty', key: 'latitude', value: 51.5074 },
            { type: 'ObjectProperty', key: 'longitude', value: -0.1278 },
          ],
          traits: [],
        }] as any,
      }));

      expect(doc.entities[0].extensions![0].altitude).toBe(0);
    });

    it('omits geospatial data when disabled', () => {
      const c = new OpenXRSpatialEntitiesCompiler({ includeGeospatial: false });
      const doc = compileAndParse(c, makeComposition({
        objects: [{
          type: 'Object',
          name: 'NoGeoObj',
          properties: [
            { type: 'ObjectProperty', key: 'latitude', value: 37.0 },
            { type: 'ObjectProperty', key: 'longitude', value: -122.0 },
          ],
          traits: [],
        }] as any,
      }));

      expect(doc.entities[0].extensions).toBeUndefined();
    });

    it('does not include geospatial extension when no lat/lon', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'NoGeo',
          properties: [
            { type: 'ObjectProperty', key: 'position', value: [1, 2, 3] },
          ],
          traits: [],
        }] as any,
      }));

      expect(doc.entities[0].extensions).toBeUndefined();
      expect(doc.requiredExtensions).not.toContain('XR_EXT_geospatial');
    });
  });

  // =========================================================================
  // RBAC Validation
  // =========================================================================

  describe('RBAC validation', () => {
    it('compiles successfully with valid token', () => {
      // The mock always returns allowed: true
      expect(() => {
        compiler.compile(makeComposition(), 'test-token');
      }).not.toThrow();
    });

    it('skips validation when no token provided', () => {
      // CompilerBase skips validation for falsy tokens
      expect(() => {
        compiler.compile(makeComposition(), '');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // Annotations (UI elements)
  // =========================================================================

  describe('annotation entities', () => {
    it('creates annotation entities from UI elements', () => {
      const doc = compileAndParse(compiler, makeComposition({
        ui: {
          type: 'UI',
          elements: [{
            type: 'UIElement',
            name: 'InfoPanel',
            properties: [
              { type: 'UIProperty', key: 'text', value: 'Welcome to the gallery' },
              { type: 'UIProperty', key: 'position', value: [0, 2, -3] },
              { type: 'UIProperty', key: 'width', value: 2.0 },
              { type: 'UIProperty', key: 'height', value: 1.0 },
            ],
          }],
        } as any,
      }));

      expect(doc.entities.length).toBe(1);
      const entity = doc.entities[0];
      expect(entity.entityType).toBe('annotation');
      expect(entity.name).toBe('InfoPanel');
      expect(entity.pose.position).toEqual({ x: 0, y: 2, z: -3 });

      // Check 2D bounds component
      const boundsComp = entity.components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_BOUNDED_2D',
      );
      expect(boundsComp).toBeDefined();
      expect((boundsComp as any).extent).toEqual({ width: 2.0, height: 1.0 });

      // Check semantic label component
      const labelComp = entity.components.find(
        c => c.type === 'XR_SPATIAL_COMPONENT_TYPE_SEMANTIC_LABEL',
      );
      expect(labelComp).toBeDefined();
      expect((labelComp as any).labels).toContain('annotation');
      expect((labelComp as any).labels).toContain('Welcome to the gallery');
    });
  });

  // =========================================================================
  // Minified Output
  // =========================================================================

  describe('output formatting', () => {
    it('produces minified output when jsonIndent is 0', () => {
      const c = new OpenXRSpatialEntitiesCompiler({ jsonIndent: 0 });
      const result = c.compile(makeComposition(), 'test-token');
      // Minified JSON has no newlines
      expect(result).not.toContain('\n');
    });

    it('produces indented output by default', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result).toContain('\n');
    });
  });

  // =========================================================================
  // Complex Scene Integration
  // =========================================================================

  describe('complex scene', () => {
    it('handles a composition with all entity types', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'Table',
          properties: [
            { type: 'ObjectProperty', key: 'mesh', value: 'box' },
            { type: 'ObjectProperty', key: 'position', value: [0, 0.5, 0] },
          ],
          traits: [
            { type: 'ObjectTrait', name: 'anchor', config: {} },
          ],
        }] as any,
        spatialGroups: [{
          type: 'SpatialGroup',
          name: 'Room',
          properties: [
            { type: 'GroupProperty', key: 'position', value: [0, 0, 0] },
          ],
          objects: [{
            type: 'Object',
            name: 'Chair',
            properties: [],
            traits: [],
          }],
        }] as any,
        zones: [{
          type: 'Zone',
          name: 'PlayArea',
          properties: [
            { type: 'ZoneProperty', key: 'size', value: [5, 3, 5] },
          ],
          handlers: [],
        }] as any,
        waypointSets: [{
          type: 'Waypoints',
          name: 'TourPath',
          points: [[0, 0, 0], [3, 0, 0]],
        }] as any,
      }));

      // Table(1) + Room group(1) + Chair under Room(1) + PlayArea zone(1)
      // + TourPath group(1) + 2 waypoints = 7 total
      expect(doc.entities.length).toBe(7);

      const types = doc.entities.map(e => e.entityType);
      expect(types.filter(t => t === 'object').length).toBe(2);
      expect(types.filter(t => t === 'group').length).toBe(2);
      expect(types.filter(t => t === 'zone').length).toBe(1);
      expect(types.filter(t => t === 'waypoint').length).toBe(2);
    });

    it('generates unique entity IDs', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [
          { type: 'Object', name: 'A', properties: [], traits: [] },
          { type: 'Object', name: 'B', properties: [], traits: [] },
          { type: 'Object', name: 'C', properties: [], traits: [] },
        ] as any,
      }));

      const ids = doc.entities.map(e => e.entityId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  // =========================================================================
  // Metadata Extraction
  // =========================================================================

  describe('metadata extraction', () => {
    it('includes non-standard properties as metadata', () => {
      const doc = compileAndParse(compiler, makeComposition({
        objects: [{
          type: 'Object',
          name: 'CustomObj',
          properties: [
            { type: 'ObjectProperty', key: 'position', value: [0, 0, 0] },
            { type: 'ObjectProperty', key: 'interactionRange', value: 2.5 },
            { type: 'ObjectProperty', key: 'description', value: 'A custom object' },
          ],
          traits: [],
        }] as any,
      }));

      const entity = doc.entities[0];
      expect(entity.metadata).toBeDefined();
      expect(entity.metadata!.interactionRange).toBe(2.5);
      expect(entity.metadata!.description).toBe('A custom object');
      // Standard properties should NOT be in metadata
      expect(entity.metadata!.position).toBeUndefined();
    });
  });
});
