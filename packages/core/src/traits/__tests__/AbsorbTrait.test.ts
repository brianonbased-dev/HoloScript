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

  describe('Class method extraction', () => {
    it('extracts Python class methods and __init__ properties', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'agent.py',
        content: `
class RobotAgent(BaseAgent):
    def __init__(self, name: str):
        self.name = name
        self.health = 100
        self.active = True

    async def move(self, x: float, y: float) -> bool:
        pass

    def get_status(self) -> str:
        return self.name
`,
      };

      const result = processor.absorb(source);
      expect(result.classes).toHaveLength(1);
      const cls = result.classes[0];
      expect(cls.methods.length).toBeGreaterThanOrEqual(2); // __init__, move, get_status
      
      // Check method extraction
      const moveMethod = cls.methods.find((m) => m.name === 'move');
      expect(moveMethod).toBeDefined();
      expect(moveMethod!.isAsync).toBe(true);
      expect(moveMethod!.params.length).toBeGreaterThanOrEqual(2); // x, y (self filtered)
      
      const getStatus = cls.methods.find((m) => m.name === 'get_status');
      expect(getStatus).toBeDefined();
      expect(getStatus!.returnType).toBe('str');

      // Check __init__ property extraction
      expect(cls.properties.length).toBeGreaterThanOrEqual(2);
      const nameProp = cls.properties.find((p) => p.name === 'name');
      expect(nameProp).toBeDefined();
    });

    it('extracts TypeScript class methods and properties', () => {
      const source: AbsorbSource = {
        language: 'typescript',
        filePath: 'service.ts',
        content: `
export class UserService extends BaseService {
  private name: string = "default";
  
  async fetchUser(id: number): User {
    return db.find(id);
  }

  updateName(newName: string): void {
    this.name = newName;
  }
}
`,
      };

      const result = processor.absorb(source);
      expect(result.classes).toHaveLength(1);
      const cls = result.classes[0];
      expect(cls.baseClass).toBe('BaseService');
      expect(cls.isExported).toBe(true);
      
      // Methods
      expect(cls.methods.length).toBeGreaterThanOrEqual(2);
      const fetchUser = cls.methods.find((m) => m.name === 'fetchUser');
      expect(fetchUser).toBeDefined();
      expect(fetchUser!.isAsync).toBe(true);
      
      // Generated .hsplus should include methods
      expect(result.generatedHSPlus).toContain('template "UserService"');
      expect(result.generatedHSPlus).toContain('on fetchUser');
      expect(result.generatedHSPlus).toContain('on updateName');
    });

    it('generates .hsplus with methods from classes', () => {
      const source: AbsorbSource = {
        language: 'python',
        filePath: 'bot.py',
        content: `
class ChatBot:
    def respond(self, message: str) -> str:
        pass
    def learn(self, data: dict):
        pass
`,
      };

      const result = processor.absorb(source);
      expect(result.generatedHSPlus).toContain('template "ChatBot"');
      expect(result.generatedHSPlus).toContain('on respond');
      expect(result.generatedHSPlus).toContain('on learn');
    });
  });

  describe('Runtime state binding', () => {
    it('resolves identifiers from runtimeState', async () => {
      const { ScriptTestRunner } = await import('../ScriptTestTrait');
      const runner = new ScriptTestRunner({
        runtimeState: {
          balance: 500,
          entity: { health: 100, name: 'player' },
        },
      });

      const source = `
@script_test "balance check" {
  assert { balance == 500 }
}

@script_test "dot notation" {
  assert { entity.health == 100 }
}
`;

      const results = runner.runTestsFromSource(source);
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('passed');
      expect(results[1].status).toBe('passed');
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
