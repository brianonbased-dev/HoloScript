/**
 * InteropBindingGenerator.test.ts — Tests for Python/JS binding generation
 */

import { describe, it, expect } from 'vitest';
import { InteropBindingGenerator } from '../InteropBindingGenerator';
import type { HSPlusAST } from '../../types/HoloScriptPlus';

describe('InteropBindingGenerator', () => {
  const generator = new InteropBindingGenerator();

  function makeAST(body: any[]): HSPlusAST {
    return { body } as any;
  }

  describe('extractExports', () => {
    it('extracts function declarations', () => {
      const ast = makeAST([
        {
          type: 'FunctionDeclaration',
          name: 'greet',
          params: [{ name: 'name', type: 'string' }],
          returnType: 'string',
        },
      ]);
      const exports = generator.extractExports(ast);
      expect(exports).toHaveLength(1);
      expect(exports[0].name).toBe('greet');
      expect(exports[0].type).toBe('function');
      expect(exports[0].parameters?.[0].name).toBe('name');
    });

    it('extracts template declarations', () => {
      const ast = makeAST([{ type: 'template', name: 'Robot' }]);
      const exports = generator.extractExports(ast);
      expect(exports[0].type).toBe('class');
      expect(exports[0].name).toBe('Robot');
    });

    it('extracts compositions', () => {
      const ast = makeAST([{ type: 'composition', name: 'MyScene' }]);
      const exports = generator.extractExports(ast);
      expect(exports[0].type).toBe('module');
    });

    it('extracts state/variables', () => {
      const ast = makeAST([{ type: 'VariableDeclaration', name: 'MAX_SPEED', value: 100 }]);
      const exports = generator.extractExports(ast);
      expect(exports[0].type).toBe('constant');
      expect(exports[0].value).toBe(100);
    });
  });

  describe('generatePythonBindings', () => {
    it('generates valid Python with docstring', () => {
      const ast = makeAST([
        {
          type: 'FunctionDeclaration',
          name: 'calculate',
          params: [{ name: 'x', type: 'number' }],
          returnType: 'number',
        },
      ]);
      const result = generator.generatePythonBindings(ast, 'test.hsplus');
      expect(result.language).toBe('python');
      expect(result.code).toContain('def calculate');
      expect(result.code).toContain('x: float');
      expect(result.code).toContain('-> float');
      expect(result.code).toContain('__all__');
      expect(result.exports).toContain('calculate');
    });

    it('generates classes from templates', () => {
      const ast = makeAST([{ type: 'template', name: 'Agent' }]);
      const result = generator.generatePythonBindings(ast, 'agent.hs');
      expect(result.code).toContain('class Agent:');
      expect(result.code).toContain('def __init__');
    });

    it('handles optional parameters', () => {
      const ast = makeAST([
        {
          type: 'FunctionDeclaration',
          name: 'setup',
          params: [{ name: 'debug', type: 'boolean', optional: true }],
        },
      ]);
      const result = generator.generatePythonBindings(ast, 'test.hs');
      expect(result.code).toContain('debug: bool = None');
    });
  });

  describe('generateJSBindings', () => {
    it('generates valid ESM exports', () => {
      const ast = makeAST([
        { type: 'FunctionDeclaration', name: 'run', params: [] },
        { type: 'VariableDeclaration', name: 'VERSION', value: '5.0' },
      ]);
      const result = generator.generateJSBindings(ast, 'service.hsplus');
      expect(result.language).toBe('javascript');
      expect(result.code).toContain('export function run');
      expect(result.code).toContain('export const VERSION');
      expect(result.exports).toEqual(['run', 'VERSION']);
    });

    it('generates classes from templates', () => {
      const ast = makeAST([{ type: 'template', name: 'Drone' }]);
      const result = generator.generateJSBindings(ast, 'drone.hs');
      expect(result.code).toContain('export class Drone');
    });
  });

  describe('metadata', () => {
    it('includes source file and version', () => {
      const ast = makeAST([]);
      const result = generator.generatePythonBindings(ast, 'input.hsplus');
      expect(result.metadata.sourceFile).toBe('input.hsplus');
      expect(result.metadata.holoScriptVersion).toBe('5.0.0');
      expect(result.metadata.generatedAt).toBeDefined();
    });
  });
});
