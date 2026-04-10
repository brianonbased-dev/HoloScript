/**
 * Semantic System Tests
 *
 * Tests for the semantic annotation modules:
 * - SemanticAnnotation
 * - PropertyAnnotations
 * - DataBindingSchema
 * - CapabilityMatrix
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  // SemanticAnnotation
  SemanticRegistry,
  getSemanticRegistry,
  createAnnotation,
  createSchema,
  createDefaultFlags,
  createEmptyConstraints,
  // PropertyAnnotations
  PropertyAnnotations,
  // DataBindingSchema
  BindingManager,
  getBindingManager,
  createBinding,
  // CapabilityMatrix
  CapabilityMatrix,
  getCapabilityMatrix,
  CommonFeatures,
} from '../semantics';

// ============================================================================
// SemanticAnnotation Tests
// ============================================================================

describe('SemanticAnnotation', () => {
  describe('createAnnotation', () => {
    it('should create annotation with required fields', () => {
      const annotation = createAnnotation('position', 'Position', 'spatial');

      expect(annotation.propertyPath).toBe('position');
      expect(annotation.label).toBe('Position');
      expect(annotation.category).toBe('spatial');
    });

    it('should set default intent to state', () => {
      const annotation = createAnnotation('health', 'Health', 'behavioral');
      expect(annotation.intent).toBe('state');
    });

    it('should use default flags', () => {
      const annotation = createAnnotation('color', 'Color', 'visual');

      expect(annotation.flags.mutable).toBe(true);
      expect(annotation.flags.networked).toBe(false);
      expect(annotation.flags.persistent).toBe(false);
      expect(annotation.flags.inspectable).toBe(true);
    });

    it('should allow custom options', () => {
      const annotation = createAnnotation('velocity', 'Velocity', 'physical', {
        intent: 'computed',
        flags: {
          ...createDefaultFlags(),
          networked: true,
          affectsPhysics: true,
        },
        unit: 'm/s',
        aiHint: 'Current movement speed',
      });

      expect(annotation.intent).toBe('computed');
      expect(annotation.flags.networked).toBe(true);
      expect(annotation.flags.affectsPhysics).toBe(true);
      expect(annotation.unit).toBe('m/s');
      expect(annotation.aiHint).toBe('Current movement speed');
    });

    it('should set constraints', () => {
      const annotation = createAnnotation('scale', 'Scale', 'spatial', {
        constraints: {
          min: 0.1,
          max: 10,
          defaultValue: 1,
        },
      });

      expect(annotation.constraints.min).toBe(0.1);
      expect(annotation.constraints.max).toBe(10);
      expect(annotation.constraints.defaultValue).toBe(1);
    });

    it('should set relations', () => {
      const annotation = createAnnotation('parent', 'Parent Entity', 'identity', {
        relations: [
          {
            type: 'parent_of',
            target: 'children',
            required: false,
            cardinality: 'many',
          },
        ],
      });

      expect(annotation.relations).toHaveLength(1);
      expect(annotation.relations[0].type).toBe('parent_of');
    });
  });

  describe('createDefaultFlags', () => {
    it('should return default flag values', () => {
      const flags = createDefaultFlags();

      expect(flags.mutable).toBe(true);
      expect(flags.networked).toBe(false);
      expect(flags.persistent).toBe(false);
      expect(flags.inspectable).toBe(true);
      expect(flags.animatable).toBe(false);
      expect(flags.affectsRender).toBe(false);
      expect(flags.affectsPhysics).toBe(false);
      expect(flags.required).toBe(false);
      expect(flags.deprecated).toBe(false);
      expect(flags.sensitive).toBe(false);
    });
  });

  describe('createEmptyConstraints', () => {
    it('should return empty constraints object', () => {
      const constraints = createEmptyConstraints();
      expect(constraints).toEqual({});
    });
  });
});

describe('SemanticSchema', () => {
  describe('createSchema', () => {
    it('should create schema with required fields', () => {
      const schema = createSchema('Player', 'player', '1.0.0');

      expect(schema.name).toBe('Player');
      expect(schema.entityType).toBe('player');
      expect(schema.version).toBe('1.0.0');
      expect(schema.id).toBe('schema_player_1.0.0');
    });

    it('should have empty annotations map', () => {
      const schema = createSchema('Enemy', 'enemy', '1.0.0');
      expect(schema.annotations).toBeInstanceOf(Map);
      expect(schema.annotations.size).toBe(0);
    });

    it('should allow custom options', () => {
      const schema = createSchema('Weapon', 'weapon', '1.0.0', {
        description: 'Base weapon entity',
        extends: ['item'],
        tags: ['combat', 'equipment'],
      });

      expect(schema.description).toBe('Base weapon entity');
      expect(schema.extends).toEqual(['item']);
      expect(schema.tags).toEqual(['combat', 'equipment']);
    });
  });
});

describe('SemanticRegistry', () => {
  let registry: SemanticRegistry;

  beforeEach(() => {
    SemanticRegistry.resetInstance();
    registry = getSemanticRegistry();
  });

  afterEach(() => {
    SemanticRegistry.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getSemanticRegistry();
      const instance2 = getSemanticRegistry();
      expect(instance1).toBe(instance2);
    });
  });

  describe('registerSchema', () => {
    it('should register schema', () => {
      const schema = createSchema('Test', 'test', '1.0.0');
      registry.registerSchema(schema);

      expect(registry.getSchema('schema_test_1.0.0')).toBe(schema);
    });

    it('should index annotations', () => {
      const schema = createSchema('Test', 'test', '1.0.0');
      const annotation = createAnnotation('position', 'Position', 'spatial');
      schema.annotations.set('position', annotation);

      registry.registerSchema(schema);

      const retrieved = registry.getAnnotation('test', 'position');
      expect(retrieved).toBe(annotation);
    });
  });

  describe('getSchemaForEntity', () => {
    it('should find schema by entity type', () => {
      const schema = createSchema('Player', 'player', '1.0.0');
      registry.registerSchema(schema);

      const found = registry.getSchemaForEntity('player');
      expect(found).toBe(schema);
    });

    it('should return undefined for unknown entity type', () => {
      const found = registry.getSchemaForEntity('unknown');
      expect(found).toBeUndefined();
    });
  });

  describe('findByCategory', () => {
    it('should find annotations by category', () => {
      const schema = createSchema('Entity', 'entity', '1.0.0');
      schema.annotations.set('position', createAnnotation('position', 'Position', 'spatial'));
      schema.annotations.set('rotation', createAnnotation('rotation', 'Rotation', 'spatial'));
      schema.annotations.set('health', createAnnotation('health', 'Health', 'behavioral'));

      registry.registerSchema(schema);

      const spatialAnnotations = registry.findByCategory('spatial');
      expect(spatialAnnotations.length).toBe(2);
    });
  });

  describe('findByIntent', () => {
    it('should find annotations by intent', () => {
      const schema = createSchema('Entity', 'entity', '1.0.0');
      schema.annotations.set(
        'config',
        createAnnotation('config', 'Config', 'behavioral', {
          intent: 'config',
        })
      );
      schema.annotations.set(
        'state',
        createAnnotation('state', 'State', 'behavioral', {
          intent: 'state',
        })
      );

      registry.registerSchema(schema);

      const configAnnotations = registry.findByIntent('config');
      expect(configAnnotations.length).toBe(1);
      expect(configAnnotations[0].label).toBe('Config');
    });
  });

  describe('validateValue', () => {
    it('should validate number constraints', () => {
      const annotation = createAnnotation('health', 'Health', 'behavioral', {
        constraints: {
          min: 0,
          max: 100,
        },
      });

      const validResult = registry.validateValue(annotation, 50);
      expect(validResult.valid).toBe(true);

      const invalidLow = registry.validateValue(annotation, -10);
      expect(invalidLow.valid).toBe(false);

      const invalidHigh = registry.validateValue(annotation, 150);
      expect(invalidHigh.valid).toBe(false);
    });

    it('should validate required fields', () => {
      const annotation = createAnnotation('name', 'Name', 'identity', {
        flags: {
          ...createDefaultFlags(),
          required: true,
        },
      });

      const invalidResult = registry.validateValue(annotation, undefined);
      expect(invalidResult.valid).toBe(false);
    });

    it('should validate string length', () => {
      const annotation = createAnnotation('username', 'Username', 'identity', {
        constraints: {
          minLength: 3,
          maxLength: 20,
        },
      });

      const validResult = registry.validateValue(annotation, 'player123');
      expect(validResult.valid).toBe(true);

      const tooShort = registry.validateValue(annotation, 'ab');
      expect(tooShort.valid).toBe(false);

      const tooLong = registry.validateValue(annotation, 'a'.repeat(25));
      expect(tooLong.valid).toBe(false);
    });

    it('should validate allowed values', () => {
      const annotation = createAnnotation('difficulty', 'Difficulty', 'behavioral', {
        constraints: {
          allowedValues: ['easy', 'normal', 'hard'],
        },
      });

      const validResult = registry.validateValue(annotation, 'normal');
      expect(validResult.valid).toBe(true);

      const invalidResult = registry.validateValue(annotation, 'extreme');
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('generateAIContext', () => {
    it('should generate AI context for entity', () => {
      const schema = createSchema('Player', 'player', '1.0.0', {
        description: 'A player entity',
      });
      schema.annotations.set(
        'health',
        createAnnotation('health', 'Health', 'behavioral', {
          description: 'Player health points',
          aiHint: 'Affects player survival',
          unit: 'hp',
        })
      );

      registry.registerSchema(schema);

      const context = registry.generateAIContext('player');
      expect(context).toContain('Player');
      expect(context).toContain('Health');
      expect(context).toContain('hp');
    });
  });
});

// ============================================================================
// PropertyAnnotations Tests
// ============================================================================

describe('PropertyAnnotations', () => {
  describe('spatial annotations', () => {
    it('should create position annotation', () => {
      const annotation = PropertyAnnotations.position('entity.position');
      expect(annotation.category).toBe('spatial');
      expect(annotation.propertyPath).toBe('entity.position');
    });

    it('should create rotation annotation', () => {
      const annotation = PropertyAnnotations.rotation('entity.rotation');
      expect(annotation.category).toBe('spatial');
      expect(annotation.propertyPath).toBe('entity.rotation');
    });

    it('should create scale annotation', () => {
      const annotation = PropertyAnnotations.scale('entity.scale');
      expect(annotation.category).toBe('spatial');
      expect(annotation.propertyPath).toBe('entity.scale');
    });
  });

  describe('visual annotations', () => {
    it('should create color annotation', () => {
      const annotation = PropertyAnnotations.color('material.color');
      expect(annotation.category).toBe('visual');
      expect(annotation.flags.affectsRender).toBe(true);
    });

    it('should create opacity annotation', () => {
      const annotation = PropertyAnnotations.opacity('material.opacity');
      expect(annotation.constraints.min).toBe(0);
      expect(annotation.constraints.max).toBe(1);
    });
  });

  describe('physics annotations', () => {
    it('should create mass annotation', () => {
      const annotation = PropertyAnnotations.mass('rigidbody.mass');
      expect(annotation.category).toBe('physical');
      expect(annotation.constraints.min).toBe(0);
    });

    it('should create velocity annotation', () => {
      const annotation = PropertyAnnotations.velocity('rigidbody.velocity');
      expect(annotation.category).toBe('physical');
      expect(annotation.flags.affectsPhysics).toBe(true);
    });
  });

  describe('generic annotations', () => {
    it('should create text annotation', () => {
      const annotation = PropertyAnnotations.text('name');
      expect(annotation.category).toBe('identity');
      expect(annotation.propertyPath).toBe('name');
    });

    it('should create toggle annotation', () => {
      const annotation = PropertyAnnotations.toggle('isActive');
      expect(annotation.propertyPath).toBe('isActive');
    });
  });
});

// ============================================================================
// DataBindingSchema Tests
// ============================================================================

describe('DataBindingSchema', () => {
  describe('createBinding', () => {
    it('should create binding with required fields', () => {
      const binding = createBinding({
        source: 'player.position',
        target: 'camera.followTarget',
      });

      expect(binding).toBeDefined();
      expect(binding.id).toBeDefined();
    });

    it('should have default direction', () => {
      const binding = createBinding({
        source: 'a.x',
        target: 'b.y',
      });

      expect(binding.direction).toBe('one-way');
    });

    it('should be enabled by default', () => {
      const binding = createBinding({
        source: 'a.x',
        target: 'b.y',
      });

      expect(binding.enabled).toBe(true);
    });
  });
});

describe('BindingManager', () => {
  let manager: BindingManager;

  beforeEach(() => {
    BindingManager.resetInstance();
    manager = getBindingManager();
  });

  afterEach(() => {
    BindingManager.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getBindingManager();
      const instance2 = getBindingManager();
      expect(instance1).toBe(instance2);
    });
  });

  describe('registerBinding', () => {
    it('should register binding', () => {
      const binding = createBinding({
        source: 'a.x',
        target: 'b.y',
      });

      manager.registerBinding(binding);
      expect(manager.getBinding(binding.id)).toBeDefined();
    });
  });
});

// ============================================================================
// CapabilityMatrix Tests
// ============================================================================

describe('CapabilityMatrix', () => {
  let matrix: CapabilityMatrix;

  beforeEach(() => {
    CapabilityMatrix.resetInstance();
    matrix = getCapabilityMatrix();
  });

  afterEach(() => {
    CapabilityMatrix.resetInstance();
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getCapabilityMatrix();
      const instance2 = getCapabilityMatrix();
      expect(instance1).toBe(instance2);
    });
  });

  describe('instance', () => {
    it('should be created successfully', () => {
      expect(matrix).toBeDefined();
    });
  });
});

describe('CommonFeatures', () => {
  it('should define standard feature constants', () => {
    // CommonFeatures is exported as object with feature name strings
    expect(CommonFeatures).toBeDefined();
    expect(typeof CommonFeatures).toBe('object');
  });
});
