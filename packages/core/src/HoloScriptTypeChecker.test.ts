/**
 * HoloScriptTypeChecker Tests
 *
 * Comprehensive tests for static type analysis in HoloScript.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoloScriptTypeChecker,
  TypeCheckResult,
  TypeDiagnostic,
  TypeInfo,
  HoloScriptType,
} from './HoloScriptTypeChecker';
import type {
  ASTNode,
  OrbNode,
  MethodNode,
  ConnectionNode,
  GateNode,
  StreamNode,
  VariableDeclarationNode,
  SpreadExpression,
  MatchExpression,
  TypeGuardExpression,
} from './types';

describe('HoloScriptTypeChecker', () => {
  let checker: HoloScriptTypeChecker;

  beforeEach(() => {
    checker = new HoloScriptTypeChecker();
  });

  // ==========================================================================
  // Basic Type Checking
  // ==========================================================================

  describe('check()', () => {
    it('should return valid result for empty AST', () => {
      const result = checker.check([]);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should collect orb declarations', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'testOrb',
          shape: 'sphere',
          properties: { radius: 1 },
        } as OrbNode,
      ];

      const result = checker.check(ast);
      expect(result.valid).toBe(true);
      expect(result.typeMap.has('testOrb')).toBe(true);
      expect(result.typeMap.get('testOrb')?.type).toBe('orb');
    });

    it('should collect variable declarations with types', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'count',
          dataType: 'number',
          value: 42,
        } as VariableDeclarationNode,
      ];

      const result = checker.check(ast);
      expect(result.valid).toBe(true);
      expect(result.typeMap.get('count')?.type).toBe('number');
    });

    it('should infer type from value when no type annotation', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'message',
          value: 'hello world',
        } as VariableDeclarationNode,
      ];

      const result = checker.check(ast);
      expect(result.valid).toBe(true);
      expect(result.typeMap.get('message')?.type).toBe('string');
    });

    it('should detect type mismatch in variable assignment', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'count',
          dataType: 'number',
          value: 'not a number',
        } as VariableDeclarationNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('Type mismatch'))).toBe(true);
    });
  });

  // ==========================================================================
  // Union Types
  // ==========================================================================

  describe('Union Types', () => {
    it('should register a union type', () => {
      checker.registerUnionType('State', ['idle', 'loading', 'error']);
      const unionType = checker.getUnionType('State');

      expect(unionType).toBeDefined();
      expect(unionType?.members).toHaveLength(3);
    });

    it('should retrieve registered union type', () => {
      checker.registerUnionType('Direction', ['north', 'south', 'east', 'west']);
      const unionType = checker.getUnionType('Direction');

      expect(unionType?.members).toContainEqual(expect.objectContaining({ value: 'north' }));
      expect(unionType?.members).toContainEqual(expect.objectContaining({ value: 'west' }));
    });

    it('should return undefined for unregistered union type', () => {
      expect(checker.getUnionType('NonExistent')).toBeUndefined();
    });

    it('should support numeric union types', () => {
      checker.registerUnionType('Priority', [1, 2, 3]);
      const unionType = checker.getUnionType('Priority');

      expect(unionType?.members).toHaveLength(3);
      expect(unionType?.members).toContainEqual(expect.objectContaining({ value: 1 }));
    });

    it('should support boolean union types', () => {
      checker.registerUnionType('Toggle', [true, false]);
      const unionType = checker.getUnionType('Toggle');

      expect(unionType?.members).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Method Declarations
  // ==========================================================================

  describe('Method Declarations', () => {
    it('should collect method declarations with parameters', () => {
      const ast: ASTNode[] = [
        {
          type: 'method',
          name: 'greet',
          parameters: [
            { name: 'name', dataType: 'string' },
            { name: 'age', dataType: 'number' },
          ],
          returnType: 'string',
          body: [],
        } as MethodNode,
      ];

      const result = checker.check(ast);
      const methodType = result.typeMap.get('greet');

      expect(methodType?.type).toBe('function');
      expect(methodType?.parameters).toHaveLength(2);
      expect(methodType?.returnType).toBe('string');
    });

    it('should default return type to void if not specified', () => {
      const ast: ASTNode[] = [
        {
          type: 'method',
          name: 'doSomething',
          parameters: [],
          body: [],
        } as MethodNode,
      ];

      const result = checker.check(ast);
      const methodType = result.typeMap.get('doSomething');

      expect(methodType?.returnType).toBe('void');
    });
  });

  // ==========================================================================
  // Stream Declarations
  // ==========================================================================

  describe('Stream Declarations', () => {
    it('should collect stream declarations', () => {
      const ast: ASTNode[] = [
        {
          type: 'stream',
          name: 'dataStream',
          source: 'api',
          transforms: [],
        } as StreamNode,
      ];

      const result = checker.check(ast);
      expect(result.typeMap.get('dataStream')?.type).toBe('stream');
    });
  });

  // ==========================================================================
  // Connection Validation
  // ==========================================================================

  describe('Connection Validation', () => {
    it('should report error for unknown source in connection', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'targetOrb',
          shape: 'cube',
          properties: {},
        } as OrbNode,
        {
          type: 'connection',
          from: 'unknownSource',
          to: 'targetOrb',
          dataType: 'any',
        } as ConnectionNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes("Unknown source 'unknownSource'"))).toBe(true);
    });

    it('should report error for unknown target in connection', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'sourceOrb',
          shape: 'sphere',
          properties: {},
        } as OrbNode,
        {
          type: 'connection',
          from: 'sourceOrb',
          to: 'unknownTarget',
          dataType: 'any',
        } as ConnectionNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes("Unknown target 'unknownTarget'"))).toBe(true);
    });

    it('should allow valid connections between orbs', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'orbA',
          shape: 'sphere',
          properties: {},
        } as OrbNode,
        {
          type: 'orb',
          name: 'orbB',
          shape: 'cube',
          properties: {},
        } as OrbNode,
        {
          type: 'connection',
          from: 'orbA',
          to: 'orbB',
          dataType: 'any',
        } as ConnectionNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Gate (Conditional) Checking
  // ==========================================================================

  describe('Gate Checking', () => {
    it('should report error for unknown variable in gate condition', () => {
      const ast: ASTNode[] = [
        {
          type: 'gate',
          condition: 'unknownVar > 5',
          truePath: [],
          falsePath: [],
        } as GateNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes("Unknown variable 'unknownVar'"))).toBe(true);
    });

    it('should allow known variables in gate condition', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'count',
          dataType: 'number',
          value: 10,
        } as VariableDeclarationNode,
        {
          type: 'gate',
          condition: 'count > 5',
          truePath: [],
          falsePath: [],
        } as GateNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('Unknown variable')
      );
      expect(errors).toHaveLength(0);
    });

    it('should narrow type in truePath with type guard', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'value',
          dataType: 'any',
          value: 42,
        } as VariableDeclarationNode,
        {
          type: 'gate',
          condition: {
            type: 'type-guard',
            subject: 'value',
            guardType: 'number',
          } as TypeGuardExpression,
          truePath: [],
          falsePath: [],
        } as GateNode,
      ];

      const result = checker.check(ast);
      const infos = result.diagnostics.filter((d) => d.severity === 'info');
      expect(infos.some((i) => i.message.includes("Type of 'value' is number"))).toBe(true);
    });
  });

  // ==========================================================================
  // Type Guard Expressions
  // ==========================================================================

  describe('Type Guard Expressions', () => {
    it('should report error for unknown variable in type guard', () => {
      const ast: ASTNode[] = [
        {
          type: 'gate',
          condition: {
            type: 'type-guard',
            subject: 'nonExistentVar',
            guardType: 'string',
          } as TypeGuardExpression,
          truePath: [],
          falsePath: [],
        } as GateNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes("Unknown variable 'nonExistentVar'"))).toBe(
        true
      );
    });
  });

  // ==========================================================================
  // Spread Expressions
  // ==========================================================================

  describe('Spread Expressions', () => {
    it('should report error for spread on non-existent target', () => {
      const ast: ASTNode[] = [
        {
          type: 'spread',
          target: 'nonExistentObject',
          values: { x: 1 },
        } as SpreadExpression,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes('nonExistentObject'))).toBe(true);
    });

    it('should error when spreading onto non-object type', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'count',
          dataType: 'number',
          value: 42,
        } as VariableDeclarationNode,
        {
          type: 'spread',
          target: 'count',
          values: { x: 1 },
        } as SpreadExpression,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes('number'))).toBe(true);
    });

    it('should allow spread on object types', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'myOrb',
          shape: 'sphere',
          properties: { radius: 1 },
        } as OrbNode,
        {
          type: 'spread',
          target: 'myOrb',
          values: { color: 'red' },
        } as SpreadExpression,
      ];

      const result = checker.check(ast);
      const spreadErrors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('spread')
      );
      expect(spreadErrors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Match Expressions
  // ==========================================================================

  describe('Match Expressions', () => {
    it('should report error for match without subject', () => {
      const ast: ASTNode[] = [
        {
          type: 'match',
          subject: '',
          cases: [{ pattern: { type: 'literal-pattern', value: 'test' }, body: [] }],
        } as unknown as MatchExpression,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes('subject'))).toBe(true);
    });

    it('should report error for match with no cases', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'state',
          dataType: 'string',
          value: 'idle',
        } as VariableDeclarationNode,
        {
          type: 'match',
          subject: 'state',
          cases: [],
        } as unknown as MatchExpression,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.includes('case'))).toBe(true);
    });

    it('should warn about duplicate case patterns', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'state',
          dataType: 'string',
          value: 'idle',
        } as VariableDeclarationNode,
        {
          type: 'match',
          subject: 'state',
          cases: [
            { pattern: { type: 'literal-pattern', value: 'idle' }, body: [] },
            { pattern: { type: 'literal-pattern', value: 'idle' }, body: [] },
          ],
        } as unknown as MatchExpression,
      ];

      const result = checker.check(ast);
      const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
      expect(warnings.some((w) => w.message.toLowerCase().includes('duplicate'))).toBe(true);
    });

    it('should warn about unreachable code after wildcard', () => {
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'state',
          dataType: 'string',
          value: 'idle',
        } as VariableDeclarationNode,
        {
          type: 'match',
          subject: 'state',
          cases: [
            { pattern: { type: 'wildcard-pattern' }, body: [] },
            { pattern: { type: 'literal-pattern', value: 'idle' }, body: [] },
          ],
        } as unknown as MatchExpression,
      ];

      const result = checker.check(ast);
      const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
      expect(warnings.some((w) => w.message.toLowerCase().includes('unreachable'))).toBe(true);
    });

    it('should check exhaustiveness for union types', () => {
      // Register union type with the variable name (implementation looks up by subject name)
      checker.registerUnionType('state', ['idle', 'loading', 'error']);

      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'state',
          dataType: 'string',
          value: 'idle',
        } as VariableDeclarationNode,
        {
          type: 'match',
          subject: 'state',
          cases: [
            { pattern: { type: 'literal-pattern', value: 'idle' }, body: [] },
            { pattern: { type: 'literal-pattern', value: 'loading' }, body: [] },
            // Missing 'error' case
          ],
        } as unknown as MatchExpression,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.some((e) => e.message.toLowerCase().includes('exhaustive'))).toBe(true);
    });

    it('should accept exhaustive match with wildcard fallback', () => {
      checker.registerUnionType('state', ['idle', 'loading', 'error']);

      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'state',
          dataType: 'string',
          value: 'idle',
        } as VariableDeclarationNode,
        {
          type: 'match',
          subject: 'state',
          cases: [
            { pattern: { type: 'literal-pattern', value: 'idle' }, body: [] },
            { pattern: { type: 'wildcard-pattern' }, body: [] },
          ],
        } as unknown as MatchExpression,
      ];

      const result = checker.check(ast);
      const exhaustivenessErrors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.toLowerCase().includes('exhaustive')
      );
      expect(exhaustivenessErrors).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Built-in Functions
  // ==========================================================================

  describe('Built-in Functions', () => {
    it('should have log function registered', () => {
      const result = checker.check([]);
      expect(result.typeMap.has('log')).toBe(true);
      expect(result.typeMap.get('log')?.type).toBe('function');
    });

    it('should have show/hide functions registered', () => {
      const result = checker.check([]);
      expect(result.typeMap.has('show')).toBe(true);
      expect(result.typeMap.has('hide')).toBe(true);
    });

    it('should have mathematical functions registered', () => {
      const result = checker.check([]);
      expect(result.typeMap.has('add')).toBe(true);
      expect(result.typeMap.has('subtract')).toBe(true);
      expect(result.typeMap.has('multiply')).toBe(true);
      expect(result.typeMap.has('divide')).toBe(true);
    });

    it('should have type checking functions registered', () => {
      const result = checker.check([]);
      expect(result.typeMap.has('isNumber')).toBe(true);
      expect(result.typeMap.has('isString')).toBe(true);
      expect(result.typeMap.has('isArray')).toBe(true);
    });
  });

  // ==========================================================================
  // Orb Properties
  // ==========================================================================

  describe('Orb Properties', () => {
    it('should infer types for orb properties', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'myOrb',
          shape: 'sphere',
          properties: {
            radius: 1.5,
            color: 'blue',
            visible: true,
            position: { x: 0, y: 1, z: 0 },
          },
        } as OrbNode,
      ];

      const result = checker.check(ast);
      const orbType = result.typeMap.get('myOrb');

      expect(orbType?.type).toBe('orb');
      expect(orbType?.properties?.get('radius')?.type).toBe('number');
      // color has a default type of 'color' in the orb property schema
      expect(orbType?.properties?.get('color')?.type).toBe('color');
      expect(orbType?.properties?.get('visible')?.type).toBe('boolean');
      // position has a default type of 'vec3' in the orb property schema
      expect(orbType?.properties?.get('position')?.type).toBe('vec3');
    });

    it('should infer custom property types', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'customOrb',
          shape: 'cube',
          properties: {
            customString: 'hello',
            customNumber: 42,
            customBool: false,
          },
        } as OrbNode,
      ];

      const result = checker.check(ast);
      const orbType = result.typeMap.get('customOrb');

      expect(orbType?.type).toBe('orb');
      expect(orbType?.properties?.get('customString')?.type).toBe('string');
      expect(orbType?.properties?.get('customNumber')?.type).toBe('number');
      expect(orbType?.properties?.get('customBool')?.type).toBe('boolean');
    });
  });

  // ==========================================================================
  // Diagnostic Codes
  // ==========================================================================

  describe('Diagnostic Codes', () => {
    it('should use E001 for unknown connection source', () => {
      const ast: ASTNode[] = [
        {
          type: 'connection',
          from: 'unknown',
          to: 'target',
          dataType: 'any',
        } as ConnectionNode,
      ];

      const result = checker.check(ast);
      expect(result.diagnostics.some((d) => d.code === 'E001')).toBe(true);
    });

    it('should use E002 for unknown connection target', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'source',
          shape: 'sphere',
          properties: {},
        } as OrbNode,
        {
          type: 'connection',
          from: 'source',
          to: 'unknown',
          dataType: 'any',
        } as ConnectionNode,
      ];

      const result = checker.check(ast);
      expect(result.diagnostics.some((d) => d.code === 'E002')).toBe(true);
    });

    it('should use E003 for unknown variable in gate', () => {
      const ast: ASTNode[] = [
        {
          type: 'gate',
          condition: 'unknownVar',
          truePath: [],
        } as GateNode,
      ];

      const result = checker.check(ast);
      expect(result.diagnostics.some((d) => d.code === 'E003')).toBe(true);
    });
  });

  // ==========================================================================
  // Type Compatibility
  // ==========================================================================

  describe('Type Compatibility', () => {
    it('should treat any as compatible with everything', () => {
      // This is tested through connections with dataType: 'any'
      const ast: ASTNode[] = [
        {
          type: 'variable-declaration',
          name: 'numVar',
          dataType: 'number',
          value: 42,
        } as VariableDeclarationNode,
        {
          type: 'variable-declaration',
          name: 'anyVar',
          dataType: 'any',
          value: 'string value',
        } as VariableDeclarationNode,
        {
          type: 'connection',
          from: 'numVar',
          to: 'anyVar',
          dataType: 'any',
        } as ConnectionNode,
      ];

      const result = checker.check(ast);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors).toHaveLength(0);
    });

    it('should allow vec3 and euler compatibility', () => {
      // vec3 and euler should be compatible (spatial types)
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'orbA',
          shape: 'sphere',
          properties: { rotation: { x: 0, y: 0, z: 0 } }, // euler-like
        } as OrbNode,
        {
          type: 'orb',
          name: 'orbB',
          shape: 'cube',
          properties: { position: { x: 1, y: 2, z: 3 } }, // vec3-like
        } as OrbNode,
      ];

      const result = checker.check(ast);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle deeply nested structures', () => {
      const ast: ASTNode[] = [
        {
          type: 'orb',
          name: 'nestedOrb',
          shape: 'sphere',
          properties: {
            config: {
              nested: {
                deeply: {
                  value: 42,
                },
              },
            },
          },
        } as OrbNode,
      ];

      const result = checker.check(ast);
      expect(result.valid).toBe(true);
    });

    it('should handle empty method bodies', () => {
      const ast: ASTNode[] = [
        {
          type: 'method',
          name: 'emptyMethod',
          parameters: [],
          body: [],
        } as MethodNode,
      ];

      const result = checker.check(ast);
      expect(result.valid).toBe(true);
    });

    it('should handle methods with complex parameter types', () => {
      const ast: ASTNode[] = [
        {
          type: 'method',
          name: 'complexMethod',
          parameters: [
            { name: 'position', dataType: 'vec3' },
            { name: 'rotation', dataType: 'quat' },
            { name: 'options', dataType: 'object', optional: true },
          ],
          returnType: 'orb',
          body: [],
        } as MethodNode,
      ];

      const result = checker.check(ast);
      const methodType = result.typeMap.get('complexMethod');
      expect(methodType?.parameters).toHaveLength(3);
      expect(methodType?.returnType).toBe('orb');
    });
  });
});
