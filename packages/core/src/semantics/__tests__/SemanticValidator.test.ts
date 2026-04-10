import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticValidator } from '../SemanticValidator';
import type { ASTProgram, HSPlusNode } from '../../types/AdvancedTypeSystem';

describe('SemanticValidator', () => {
  let validator: SemanticValidator;

  beforeEach(() => {
    validator = new SemanticValidator();
  });

  it('should report error when referenced semantic is missing', () => {
    const ast: any = {
      root: {
        id: 'test-node',
        directives: [{ name: 'semantic_ref', args: ['missing-semantic'], type: 'directive' }],
        children: [],
      },
    };

    const errors = validator.validate(ast);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('is not defined');
  });

  it('should report error for missing required properties', () => {
    const ast: any = {
      root: {
        id: 'root',
        directives: [
          {
            name: 'semantic',
            args: ['player'],
            type: 'directive',
            config: {
              properties: { health: {} },
            },
          },
        ],
        children: [
          {
            id: 'my-player',
            properties: {}, // Missing health
            directives: [{ name: 'semantic_ref', args: ['player'], type: 'directive' }],
            children: [],
          },
        ],
      },
    };

    const errors = validator.validate(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.find((e) => e.message.includes('missing required property "health"'))
    ).toBeDefined();
  });

  it('should report error for missing required traits', () => {
    const ast: any = {
      root: {
        id: 'root',
        directives: [
          {
            name: 'semantic',
            args: ['interactable'],
            type: 'directive',
            config: {
              traits: ['grabbable'],
            },
          },
        ],
        children: [
          {
            id: 'object-1',
            properties: {},
            traits: new Map(), // Missing grabbable
            directives: [{ name: 'semantic_ref', args: ['interactable'], type: 'directive' }],
            children: [],
          },
        ],
      },
    };

    const errors = validator.validate(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.find((e) => e.message.includes('missing required trait "@grabbable"'))
    ).toBeDefined();
  });

  it('should pass when all requirements are met', () => {
    const ast: any = {
      root: {
        id: 'root',
        directives: [
          {
            name: 'semantic',
            args: ['player'],
            type: 'directive',
            config: {
              properties: { health: {} },
              traits: ['networked'],
            },
          },
        ],
        children: [
          {
            id: 'my-player',
            properties: { health: 100 },
            traits: new Map([['networked', {}]]),
            directives: [{ name: 'semantic_ref', args: ['player'], type: 'directive' }],
            children: [],
          },
        ],
      },
    };

    const errors = validator.validate(ast);
    expect(errors).toHaveLength(0);
  });

  it('should report error for property type mismatch', () => {
    const ast: any = {
      root: {
        id: 'root',
        directives: [
          {
            name: 'semantic',
            args: ['player'],
            type: 'directive',
            config: {
              properties: { health: 'number' },
            },
          },
        ],
        children: [
          {
            id: 'my-player',
            properties: { health: 'full' }, // Should be number
            directives: [{ name: 'semantic_ref', args: ['player'], type: 'directive' }],
            children: [],
          },
        ],
      },
    };

    const errors = validator.validate(ast);
    expect(errors.length).toBeGreaterThan(0);
    // Be flexible about the exact message formatting for now
    expect(errors.some((e) => e.message.includes('invalid type'))).toBe(true);
  });

  it('should report error for missing required methods', () => {
    const ast: any = {
      root: {
        id: 'root',
        directives: [
          {
            name: 'semantic',
            args: ['interactable'],
            type: 'directive',
            config: {
              methods: { on_grab: { params: [], returnType: 'void' } },
            },
          },
        ],
        children: [
          {
            id: 'object-1',
            properties: {},
            directives: [{ name: 'semantic_ref', args: ['interactable'], type: 'directive' }],
            children: [], // Missing on_grab method
          },
        ],
      },
    };

    const errors = validator.validate(ast);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.find((e) => e.message.includes('missing required method "on_grab"'))
    ).toBeDefined();
  });

  it('should pass when method is present', () => {
    const ast: any = {
      root: {
        id: 'root',
        directives: [
          {
            name: 'semantic',
            args: ['interactable'],
            type: 'directive',
            config: {
              methods: { on_grab: { params: [], returnType: 'void' } },
            },
          },
        ],
        children: [
          {
            id: 'object-1',
            properties: {},
            directives: [{ name: 'semantic_ref', args: ['interactable'], type: 'directive' }],
            children: [{ type: 'method', name: 'on_grab' }],
          },
        ],
      },
    };

    const errors = validator.validate(ast);
    expect(errors).toHaveLength(0);
  });
});
