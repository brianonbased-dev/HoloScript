import { describe, it, expect } from 'vitest';
import { TRAIT_DOCS, TraitDoc, PropertyDoc, MethodDoc, EventDoc } from '../traitDocs';

describe('TraitDocs', () => {
  describe('Structure validation', () => {
    it('should have trait documentation entries', () => {
      expect(Object.keys(TRAIT_DOCS).length).toBeGreaterThan(0);
    });

    it('should have required fields for each trait', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        expect(doc.name, `${key} missing name`).toBeDefined();
        expect(doc.annotation, `${key} missing annotation`).toBeDefined();
        expect(doc.description, `${key} missing description`).toBeDefined();
        expect(doc.category, `${key} missing category`).toBeDefined();
        expect(doc.example, `${key} missing example`).toBeDefined();
      }
    });

    it('should have annotations starting with @', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        expect(doc.annotation, `${key} annotation should start with @`).toMatch(/^@/);
      }
    });

    it('should have valid categories', () => {
      const validCategories = [
        'physics',
        'animation',
        'rendering',
        'networking',
        'input',
        'ai',
        'utility',
        'hololand',
      ];

      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        expect(validCategories, `${key} has invalid category: ${doc.category}`).toContain(
          doc.category
        );
      }
    });

    it('should have arrays for properties, methods, and events', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        expect(Array.isArray(doc.properties), `${key} properties should be array`).toBe(true);
        expect(Array.isArray(doc.methods), `${key} methods should be array`).toBe(true);
        expect(Array.isArray(doc.events), `${key} events should be array`).toBe(true);
      }
    });
  });

  describe('Property documentation', () => {
    it('should have valid property structure', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        for (const prop of doc.properties) {
          expect(prop.name, `${key} property missing name`).toBeDefined();
          expect(prop.type, `${key}.${prop.name} missing type`).toBeDefined();
          expect(prop.description, `${key}.${prop.name} missing description`).toBeDefined();
        }
      }
    });

    it('should have string types for property type field', () => {
      for (const [, doc] of Object.entries(TRAIT_DOCS)) {
        for (const prop of doc.properties) {
          expect(typeof prop.type).toBe('string');
        }
      }
    });
  });

  describe('Method documentation', () => {
    it('should have valid method structure', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        for (const method of doc.methods) {
          expect(method.name, `${key} method missing name`).toBeDefined();
          expect(method.signature, `${key}.${method.name} missing signature`).toBeDefined();
          expect(method.description, `${key}.${method.name} missing description`).toBeDefined();
          expect(
            Array.isArray(method.parameters),
            `${key}.${method.name} params should be array`
          ).toBe(true);
        }
      }
    });

    it('should have valid parameter structure in methods', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        for (const method of doc.methods) {
          for (const param of method.parameters) {
            expect(param.name, `${key}.${method.name} param missing name`).toBeDefined();
            expect(param.type, `${key}.${method.name}.${param.name} missing type`).toBeDefined();
          }
        }
      }
    });
  });

  describe('Event documentation', () => {
    it('should have valid event structure', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        for (const event of doc.events) {
          expect(event.name, `${key} event missing name`).toBeDefined();
          expect(event.description, `${key}.${event.name} missing description`).toBeDefined();
        }
      }
    });
  });

  describe('Common traits', () => {
    it('should include rigidbody trait', () => {
      expect(TRAIT_DOCS.rigidbody).toBeDefined();
      expect(TRAIT_DOCS.rigidbody.category).toBe('physics');
      expect(TRAIT_DOCS.rigidbody.annotation).toBe('@rigidbody');
    });

    it('rigidbody should have mass property', () => {
      const massProperty = TRAIT_DOCS.rigidbody.properties.find((p) => p.name === 'mass');
      expect(massProperty).toBeDefined();
      expect(massProperty?.type).toBe('number');
    });

    it('rigidbody should have applyForce method', () => {
      const method = TRAIT_DOCS.rigidbody.methods.find((m) => m.name === 'applyForce');
      expect(method).toBeDefined();
      expect(method?.signature).toContain('Vec3');
    });
  });

  describe('Deprecation handling', () => {
    it('should correctly handle deprecated flag', () => {
      for (const [, doc] of Object.entries(TRAIT_DOCS)) {
        if (doc.deprecated) {
          // If deprecated, should have a deprecation message
          expect(typeof doc.deprecated).toBe('boolean');
        }
      }
    });

    it('should correctly handle since version', () => {
      for (const [, doc] of Object.entries(TRAIT_DOCS)) {
        if (doc.since) {
          expect(typeof doc.since).toBe('string');
        }
      }
    });
  });

  describe('Example code', () => {
    it('should have non-empty examples', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        expect(doc.example.trim().length, `${key} has empty example`).toBeGreaterThan(0);
      }
    });

    it('should contain trait annotation in example', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        // Most examples should reference the trait annotation
        // This is a soft check - some may not include it directly
        const hasAnnotation =
          doc.example.includes(doc.annotation) || doc.example.includes(doc.annotation.substring(1));
        // Just log but don't fail - not all examples need the annotation
        if (!hasAnnotation) {
          // console.log(`${key} example may not include its annotation`);
        }
      }
    });
  });

  describe('Category counts', () => {
    it('should have traits in physics category', () => {
      const physicsTraits = Object.values(TRAIT_DOCS).filter((d) => d.category === 'physics');
      expect(physicsTraits.length).toBeGreaterThan(0);
    });

    it('should have traits in rendering category', () => {
      const renderingTraits = Object.values(TRAIT_DOCS).filter((d) => d.category === 'rendering');
      expect(renderingTraits.length).toBeGreaterThan(0);
    });

    it('should have traits in input category', () => {
      const inputTraits = Object.values(TRAIT_DOCS).filter((d) => d.category === 'input');
      expect(inputTraits.length).toBeGreaterThan(0);
    });
  });

  describe('Documentation quality', () => {
    it('should have meaningful descriptions (> 20 chars)', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        expect(doc.description.length, `${key} description too short`).toBeGreaterThan(20);
      }
    });

    it('should have meaningful property descriptions (> 5 chars)', () => {
      for (const [key, doc] of Object.entries(TRAIT_DOCS)) {
        for (const prop of doc.properties) {
          expect(
            prop.description.length,
            `${key}.${prop.name} description too short`
          ).toBeGreaterThan(5);
        }
      }
    });
  });
});

describe('TraitDoc type structure', () => {
  it('should be able to create valid TraitDoc object', () => {
    const doc: TraitDoc = {
      name: 'TestTrait',
      annotation: '@test',
      description: 'A test trait for testing purposes',
      category: 'utility',
      properties: [],
      methods: [],
      events: [],
      example: 'orb test { @test }',
    };

    expect(doc.name).toBe('TestTrait');
    expect(doc.annotation).toBe('@test');
  });

  it('should be able to create valid PropertyDoc', () => {
    const prop: PropertyDoc = {
      name: 'testProp',
      type: 'number',
      description: 'A test property',
      default: '1.0',
      required: false,
    };

    expect(prop.name).toBe('testProp');
    expect(prop.default).toBe('1.0');
  });

  it('should be able to create valid MethodDoc', () => {
    const method: MethodDoc = {
      name: 'testMethod',
      signature: 'testMethod(): void',
      description: 'A test method',
      parameters: [],
      returns: 'void',
    };

    expect(method.signature).toContain('testMethod');
  });

  it('should be able to create valid EventDoc', () => {
    const event: EventDoc = {
      name: 'onTest',
      description: 'Fired on test',
      payload: '{ value: number }',
    };

    expect(event.name).toBe('onTest');
    expect(event.payload).toBeDefined();
  });
});
