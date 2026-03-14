/**
 * AbsorbTrait.test.ts — Tests for @absorb reverse-mode trait
 */

import { describe, it, expect } from 'vitest';
import { AbsorbProcessor, ABSORB_TRAIT, type AbsorbSource } from '../AbsorbTrait';

describe('@absorb Trait', () => {
  const processor = new AbsorbProcessor();

  it('ABSORB_TRAIT metadata is correct', () => {
    expect(ABSORB_TRAIT.name).toBe('absorb');
    expect(ABSORB_TRAIT.category).toBe('interop');
    expect(ABSORB_TRAIT.requiresRenderer).toBe(false);
  });

  describe('Python absorption', () => {
    it('extracts functions', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'service.py',
        content: `
def greet(name: str) -> str:
    return f"Hello {name}"

async def fetch_data(url: str) -> dict:
    pass
`,
      };

      const result = processor.absorb(source);
      expect(result.functions).toHaveLength(2);
      expect(result.functions[0].name).toBe('greet');
      expect(result.functions[0].params[0].name).toBe('name');
      expect(result.functions[0].returnType).toBe('str');
      expect(result.functions[1].isAsync).toBe(true);
    });

    it('extracts classes', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'agent.py',
        content: `
class RobotAgent(BaseAgent):
    def __init__(self):
        pass
`,
      };

      const result = processor.absorb(source);
      expect(result.classes).toHaveLength(1);
      expect(result.classes[0].name).toBe('RobotAgent');
      expect(result.classes[0].baseClass).toBe('BaseAgent');
    });

    it('extracts constants', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'config.py',
        content: `
MAX_SPEED = 100
API_KEY = "secret"
`,
      };

      const result = processor.absorb(source);
      expect(result.constants).toHaveLength(2);
      expect(result.constants[0].name).toBe('MAX_SPEED');
    });

    it('extracts imports', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'main.py',
        content: `
from flask import Flask, request
import json
`,
      };

      const result = processor.absorb(source);
      expect(result.imports).toHaveLength(2);
      expect(result.imports[0].source).toBe('flask');
    });

    it('generates valid .hsplus output', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'agent.py',
        content: `
MAX_SPEED = 100

class RobotAgent(BaseAgent):
    pass

def move(x: float, y: float) -> bool:
    pass
`,
      };

      const result = processor.absorb(source);
      expect(result.generatedHSPlus).toContain('// @absorb: auto-generated');
      expect(result.generatedHSPlus).toContain('template "RobotAgent"');
      expect(result.generatedHSPlus).toContain('@extends "BaseAgent"');
      expect(result.generatedHSPlus).toContain('fn move(x, y)');
      expect(result.generatedHSPlus).toContain('state MAX_SPEED');
    });
  });

  describe('TypeScript absorption', () => {
    it('extracts functions and classes', () => {
      const source: AbsorbSource = {
        language: 'typescript',
        filePath: 'service.ts',
        content: `
import { Router } from 'express';

export async function handleRequest(req: Request): void {
  // handler
}

export class ApiService extends BaseService {
  // service
}

export const API_VERSION = "2.0";
`,
      };

      const result = processor.absorb(source);
      expect(result.functions.length).toBeGreaterThanOrEqual(1);
      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      expect(result.constants.length).toBeGreaterThanOrEqual(1);
      expect(result.generatedHSPlus).toContain('template "ApiService"');
    });
  });

  describe('Expression evaluator (enhanced @script_test)', () => {
    // Imported via ScriptTestRunner to test the new evaluator
    it('is imported alongside ScriptTestRunner', async () => {
      const { ScriptTestRunner } = await import('../ScriptTestTrait');
      const runner = new ScriptTestRunner();
      
      // Test with real expression assertions
      const source = `
@script_test "numeric comparison" {
  assert { 500 > 0 }
}

@script_test "equality" {
  assert { 42 == 42 }
}

@script_test "false assertion" {
  assert { 0 > 100 }
}
`;

      const results = runner.runTestsFromSource(source);
      expect(results).toHaveLength(3);
      expect(results[0].status).toBe('passed');
      expect(results[1].status).toBe('passed');
      expect(results[2].status).toBe('failed'); // 0 > 100 is false
    });
  });
});
