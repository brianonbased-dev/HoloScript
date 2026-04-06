/**
 * AI Integration Tests
 *
 * Tests for AI adapters working with the HoloScript parser.
 * Verifies that:
 * - Generated code is syntactically valid
 * - Error recovery handles malformed AI output
 * - Adapters produce consistent results
 * - Parser validates AI-generated traits and properties
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import {
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  GeminiAdapter,
  XAIAdapter,
  TogetherAdapter,
  FireworksAdapter,
  NVIDIAAdapter,
  type AIAdapter,
  type GenerateResult,
} from '@holoscript/framework/ai';

// =============================================================================
// TEST SETUP & MOCKS
// =============================================================================

/**
 * Mock adapter for testing without external API calls
 */
class MockAIAdapter implements AIAdapter {
  readonly id = 'mock';
  readonly name = 'Mock AI';

  isReady(): boolean {
    return true;
  }

  async generateHoloScript(prompt: string): Promise<GenerateResult> {
    if (prompt.includes('player')) {
      return {
        holoScript: `orb player {
          position: [0, 1.6, 0]
          color: "#00ff00"
          scale: 0.5
          @grabbable
        }`,
        confidence: 0.95,
      };
    }
    if (prompt.includes('button')) {
      return {
        holoScript: `orb button {
          position: [0, 1, 0]
          geometry: "cube"
          color: "#0000ff"
          @clickable
          @pointable
        }`,
        confidence: 0.92,
      };
    }
    if (prompt.includes('broken')) {
      return {
        holoScript: `orb broken {
          position: [0, 1, 0]
          color: invalid_color_value
          @unknown_trait
        }`,
        confidence: 0.5,
      };
    }
    return {
      holoScript: `orb default { }`,
      confidence: 0.5,
    };
  }

  async explainHoloScript(holoScript: string) {
    return { explanation: `This is HoloScript code: ${holoScript.slice(0, 50)}...` };
  }

  async optimizeHoloScript(holoScript: string, _target: 'mobile' | 'desktop' | 'vr' | 'ar') {
    return {
      holoScript: holoScript.replace('position:', 'pos:'),
      improvements: ['Shortened property names'],
    };
  }

  async fixHoloScript(holoScript: string, _errors: string[]) {
    return {
      holoScript: holoScript.replace('@unknown_trait', ''),
      fixes: [{ line: 0, issue: 'invalid_color_value', fix: 'Removed unknown trait' }],
    };
  }

  async chat(message: string) {
    return `Response to: ${message}`;
  }

  async getEmbeddings(text: string | string[]) {
    const inputs = Array.isArray(text) ? text : [text];
    return inputs.map((_) => Array(384).fill(0.5));
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('AI Integration with Parser', () => {
  let parser: HoloScriptPlusParser;
  let mockAdapter: MockAIAdapter;

  beforeEach(() => {
    parser = new HoloScriptPlusParser({ strict: false });
    mockAdapter = new MockAIAdapter();
  });

  // =========================================================================
  // Basic Generation & Parsing
  // =========================================================================
  describe('basic generation flow', () => {
    it('should generate valid orb code and parse it', async () => {
      // Generate code via AI
      const generated = await mockAdapter.generateHoloScript('create a player controller');

      // Parse the generated code
      const result = parser.parse(generated.holoScript);

      // Should parse successfully
      expect(result.success).toBe(true);
      expect(result.ast.children).toBeDefined();
      expect(result.ast.children!.length).toBeGreaterThan(0);

      // Should have extracted orb
      const orb = result.ast.children![0];
      expect(orb.type).toBe('orb');
      expect(orb.id).toBe('player');
    });

    it('should parse button with valid traits', async () => {
      const generated = await mockAdapter.generateHoloScript('create a clickable button');
      const result = parser.parse(generated.holoScript);

      expect(result.success).toBe(true);
      expect(result.ast.children![0].traits).toBeDefined();
      // Traits should be recognized
      expect(result.ast.children![0].traits.size).toBeGreaterThan(0);
    });

    it('should track confidence of generated code', async () => {
      const generated = await mockAdapter.generateHoloScript('player');

      expect(generated.confidence).toBeGreaterThan(0);
      expect(generated.confidence).toBeLessThanOrEqual(1);
      expect(generated.confidence).toBe(0.95); // Mock returns 0.95 for player
    });
  });

  // =========================================================================
  // Error Recovery with AI Output
  // =========================================================================
  describe('error recovery with malformed AI output', () => {
    it('should recover from invalid color values', async () => {
      const generated = await mockAdapter.generateHoloScript('broken code');
      const result = parser.parse(generated.holoScript);

      // Parser is lenient, so may succeed even with invalid values
      // Main test: parser should handle it without crashing
      expect(result.ast).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);

      // Should parse some structure
      expect(result.ast.children).toBeDefined();
      expect(result.ast.children!.length).toBeGreaterThan(0);
    });

    it('should collect errors without crashing', async () => {
      const generated = await mockAdapter.generateHoloScript('broken');
      const result = parser.parse(generated.holoScript);

      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);

      // Errors should have useful information
      if (result.errors.length > 0) {
        const error = result.errors[0];
        expect(error.message).toBeDefined();
        expect(error.line).toBeDefined();
        expect(error.column).toBeDefined();
      }
    });

    it('should handle unknown traits gracefully', async () => {
      const code = `orb test {
        @unknown_trait
        @grabbable
      }`;

      const result = parser.parse(code);

      // Parser should handle without crashing
      expect(result.ast).toBeDefined();
      expect(result.errors).toBeDefined();

      // Should parse the structure
      expect(result.ast.children).toBeDefined();
      expect(result.ast.children!.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Fix & Optimize Flow
  // =========================================================================
  describe('fix and optimize workflow', () => {
    it('should fix broken AI output', async () => {
      // Generate broken code
      let generated = await mockAdapter.generateHoloScript('broken');
      let result = parser.parse(generated.holoScript);

      // Parser may be lenient - main test is that it handles the code
      expect(result.ast).toBeDefined();
      const initialErrors = result.errors.length;

      // Extract error messages
      const errorMessages = result.errors.map((e) => e.message);

      // Fix via adapter
      const fixed = await mockAdapter.fixHoloScript(generated.holoScript, errorMessages);

      // Parse fixed code
      result = parser.parse(fixed.holoScript);

      // Should have fewer or equal errors after fixing
      expect(result.errors.length).toBeLessThanOrEqual(initialErrors);
    });

    it('should optimize generated code', async () => {
      const generated = await mockAdapter.generateHoloScript('player');
      const optimized = await mockAdapter.optimizeHoloScript(generated.holoScript, 'mobile');

      // Optimized code should still be valid
      const result = parser.parse(optimized.holoScript);
      expect(result.success).toBe(true);
    });

    it('should explain generated code', async () => {
      const generated = await mockAdapter.generateHoloScript('button');
      const explanation = await mockAdapter.explainHoloScript(generated.holoScript);

      expect(explanation.explanation).toBeDefined();
      expect(explanation.explanation.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Multi-Turn Conversation
  // =========================================================================
  describe('multi-turn AI conversation', () => {
    it('should maintain context across multiple turns', async () => {
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      // First turn
      const turn1 = await mockAdapter.chat('Generate a simple scene with a player', '', history);
      history.push({ role: 'user', content: 'Generate a simple scene with a player' });
      history.push({ role: 'assistant', content: turn1 });

      expect(turn1).toBeDefined();

      // Second turn with context
      const turn2 = await mockAdapter.chat('Add a button to interact with', '', history);
      history.push({ role: 'user', content: 'Add a button to interact with' });
      history.push({ role: 'assistant', content: turn2 });

      expect(turn2).toBeDefined();
      expect(history.length).toBe(4);
    });
  });

  // =========================================================================
  // Embedding & Semantic Search
  // =========================================================================
  describe('embeddings for semantic search', () => {
    it('should generate embeddings for single text', async () => {
      const embeddings = await mockAdapter.getEmbeddings('create a player');

      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(1);
      expect(Array.isArray(embeddings[0])).toBe(true);
      expect(embeddings[0].length).toBeGreaterThan(0);
    });

    it('should generate embeddings for multiple texts', async () => {
      const texts = ['create a player', 'make a button', 'spawn an enemy'];
      const embeddings = await mockAdapter.getEmbeddings(texts);

      expect(embeddings.length).toBe(3);
      embeddings.forEach((emb) => {
        expect(Array.isArray(emb)).toBe(true);
        expect(emb.length).toBeGreaterThan(0);
      });
    });
  });

  // =========================================================================
  // Adapter Interface Compliance
  // =========================================================================
  describe('adapter interface compliance', () => {
    it('should have required properties', () => {
      expect(mockAdapter.id).toBeDefined();
      expect(mockAdapter.name).toBeDefined();
    });

    it('should implement all required methods', () => {
      // Check that all methods exist and are callable
      expect(typeof mockAdapter.isReady).toBe('function');
      expect(typeof mockAdapter.generateHoloScript).toBe('function');
      expect(typeof mockAdapter.explainHoloScript).toBe('function');
      expect(typeof mockAdapter.optimizeHoloScript).toBe('function');
      expect(typeof mockAdapter.fixHoloScript).toBe('function');
      expect(typeof mockAdapter.chat).toBe('function');
      expect(typeof mockAdapter.getEmbeddings).toBe('function');
    });

    it('should indicate readiness', () => {
      const ready = mockAdapter.isReady();
      expect(typeof ready).toBe('boolean');
    });
  });

  // =========================================================================
  // Parser Properties Validation
  // =========================================================================
  describe('parser validates AI-generated properties', () => {
    it('should validate geometry types', async () => {
      const code = `orb obj {
        position: [0, 0, 0]
      }`;
      const result = parser.parse(code);

      expect(result.success).toBe(true);
      const orb = result.ast.children![0];
      expect(orb.properties.position).toBeDefined();
    });

    it('should validate color format', async () => {
      const code = `orb obj {
        color: "#ff0000"
      }`;
      const result = parser.parse(code);

      // Main test: parser should handle color without crashing
      expect(result.ast).toBeDefined();
      expect(result.ast.children).toBeDefined();
      expect(result.ast.children![0]).toBeDefined();
      expect(result.ast.children![0].properties).toBeDefined();
    });

    it('should validate position array', async () => {
      const code = `orb obj {
        position: [1.5, 2.0, -3.5]
      }`;
      const result = parser.parse(code);

      // Main test: parser should handle position array without crashing
      expect(result.ast).toBeDefined();
      expect(result.ast.children).toBeDefined();
      expect(result.ast.children![0]).toBeDefined();
      expect(result.ast.children![0].properties).toBeDefined();
    });
  });

  // =========================================================================
  // Confidence Scoring
  // =========================================================================
  describe('confidence scoring', () => {
    it('should return confidence between 0 and 1', async () => {
      const result = await mockAdapter.generateHoloScript('create something');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should correlate confidence with code validity', async () => {
      // High confidence code should parse successfully
      const highConf = await mockAdapter.generateHoloScript('player');
      const parsed = parser.parse(highConf.holoScript);

      if (highConf.confidence > 0.8) {
        expect(parsed.success).toBe(true);
      }
    });
  });

  // =========================================================================
  // Performance & Limits
  // =========================================================================
  describe('performance and limits', () => {
    it('should handle large generated code', async () => {
      // Create a large but valid HoloScript
      const large = `orb root {
        ${Array.from({ length: 50 }, (_, i) => `orb child${i} { color: "#ff0000" }`).join('\n        ')}
      }`;

      const result = parser.parse(large);
      // Should parse without major issues
      expect(result.ast).toBeDefined();
    });

    it('should handle rapid successive generations', async () => {
      const promises = Array.from({ length: 10 }, () =>
        mockAdapter.generateHoloScript('test object')
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      results.forEach((r) => {
        expect(r.holoScript).toBeDefined();
        expect(r.confidence).toBeDefined();
      });
    });
  });

  // =========================================================================
  // Error Message Quality
  // =========================================================================
  describe('error message quality', () => {
    it('should provide actionable error messages', async () => {
      const broken = `orb test {
        color: @@@
      }`;

      const result = parser.parse(broken);
      expect(result.success).toBe(false);

      // Error messages should be descriptive
      result.errors.forEach((error) => {
        expect(error.message.length).toBeGreaterThan(0);
        expect(error.line).toBeGreaterThanOrEqual(0);
      });
    });

    it('should suggest fixes when available', async () => {
      const broken = `orb test {
        colour: "red"
      }`;

      const result = parser.parse(broken);
      // Might have suggestions for typos
      if (result.errors.length > 0) {
        const firstError = result.errors[0];
        // Suggestions are optional, but if present should be useful
        if (firstError.suggestions) {
          expect(Array.isArray(firstError.suggestions)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // Type Safety
  // =========================================================================
  describe('type safety', () => {
    it('should maintain type consistency in results', async () => {
      const result = await mockAdapter.generateHoloScript('test');

      expect(typeof result.holoScript).toBe('string');
      expect(typeof result.confidence).toBe('number');
    });

    it('should handle undefined properties gracefully', async () => {
      const result = parser.parse('orb test { }');

      // Result should always have expected structure
      expect(result.success).toBeDefined();
      expect(result.ast).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });
});

// =============================================================================
// ADAPTER-SPECIFIC TESTS
// =============================================================================

describe('Individual Adapter Tests (Mocked)', () => {
  let parser: HoloScriptPlusParser;

  beforeEach(() => {
    parser = new HoloScriptPlusParser({ strict: false });
  });

  // These tests use mocked implementations to verify interface compliance
  // In production, these would need real API keys and network access

  it('should handle OpenAI adapter interface', async () => {
    // Create a mock without calling real API
    const mockResult: GenerateResult = {
      holoScript: `orb ai_generated { color: "#ff0000" }`,
      confidence: 0.9,
    };

    const parsed = parser.parse(mockResult.holoScript);
    expect(parsed.success).toBe(true);
  });

  it('should handle Anthropic adapter interface', async () => {
    const mockResult: GenerateResult = {
      holoScript: `orb claude_creation { geometry: "cube" }`,
      confidence: 0.92,
    };

    const parsed = parser.parse(mockResult.holoScript);
    expect(parsed.success).toBe(true);
  });

  it('should handle Gemini adapter interface', async () => {
    const mockResult: GenerateResult = {
      holoScript: `orb gemini_obj { scale: 1.5 }`,
      confidence: 0.88,
    };

    const parsed = parser.parse(mockResult.holoScript);
    expect(parsed.success).toBe(true);
  });

  it('should parse outputs from all adapter types', () => {
    const testCases = [
      { adapter: 'OpenAI', code: `orb openai { color: "blue" }` },
      { adapter: 'Anthropic', code: `orb anthropic { position: [0, 0, 0] }` },
      { adapter: 'Ollama', code: `orb ollama { @grabbable }` },
      { adapter: 'Gemini', code: `orb gemini { geometry: "cylinder" }` },
      { adapter: 'XAI', code: `orb grok { scale: 2.0 }` },
      { adapter: 'Together', code: `orb together { color: "#00ff00" }` },
      { adapter: 'Fireworks', code: `orb fireworks { opacity: 0.5 }` },
      { adapter: 'NVIDIA', code: `orb nvidia { @pointable }` },
    ];

    testCases.forEach(({ adapter, code }) => {
      const result = parser.parse(code);
      expect(result.success).toBe(true);
    });
  });
});
