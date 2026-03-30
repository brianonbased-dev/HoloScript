/**
 * Tests for HoloScriptPersistenceParser — memory/semantic/episodic/procedural blocks.
 */
import { describe, it, expect } from 'vitest';
import {
  HoloScriptPersistenceParser,
  type ParserContext,
  type Token,
} from '../../HoloScriptPersistenceParser';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTokens(defs: Array<[string, string]>): Token[] {
  return defs.map(([type, value], i) => ({ type, value, line: 1, column: i }));
}

function makeContext(tokens: Token[]): ParserContext {
  const ctx: ParserContext = {
    position: 0,
    tokens,
    currentToken() {
      return tokens[ctx.position];
    },
    advance() {
      return tokens[ctx.position++];
    },
    check(type: string, value?: string) {
      const t = tokens[ctx.position];
      if (!t) return false;
      if (t.type !== type) return false;
      if (value !== undefined && t.value !== value) return false;
      return true;
    },
    expect(type: string, value?: string) {
      if (ctx.check(type, value)) {
        ctx.advance();
        return true;
      }
      return false;
    },
    expectIdentifier() {
      const t = tokens[ctx.position];
      if (t && t.type === 'identifier') {
        ctx.advance();
        return t.value;
      }
      return null;
    },
    parseObject() {
      // Skip opening {, collect key:value pairs, skip closing }
      const obj: Record<string, unknown> = {};
      if (ctx.check('punctuation', '{')) ctx.advance();
      while (!ctx.check('punctuation', '}') && ctx.position < tokens.length) {
        const key = tokens[ctx.position];
        if (!key) break;
        ctx.advance();
        if (ctx.check('punctuation', ':')) ctx.advance();
        const val = tokens[ctx.position];
        if (val) {
          obj[key.value] = val.value;
          ctx.advance();
        }
        if (ctx.check('punctuation', ',')) ctx.advance();
      }
      if (ctx.check('punctuation', '}')) ctx.advance();
      return obj;
    },
    skipNewlines() {
      /* no-op for tests */
    },
  };
  return ctx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HoloScriptPersistenceParser', () => {
  describe('parseMemory', () => {
    it('should return null when not at a memory keyword', () => {
      const tokens = makeTokens([
        ['keyword', 'orb'],
        ['identifier', 'Foo'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      expect(parser.parseMemory()).toBeNull();
    });

    it('should parse empty memory block', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'AgentMemory'],
        ['punctuation', '{'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.type).toBe('memory');
      expect(result!.name).toBe('AgentMemory');
    });

    it('should use default name when identifier missing', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['punctuation', '{'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('UnnamedMemory');
    });

    it('should parse memory block with semantic sub-block', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'BrainMem'],
        ['punctuation', '{'],
        ['identifier', 'semantic'],
        ['punctuation', ':'],
        ['identifier', 'SemanticMemory'],
        ['punctuation', '{'],
        ['identifier', 'capacity'],
        ['punctuation', ':'],
        ['number', '1000'],
        ['punctuation', '}'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('BrainMem');
      expect(result!.semantic).toBeDefined();
      expect(result!.semantic!.type).toBe('semantic-memory');
    });

    it('should parse memory block with episodic sub-block', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'EpMem'],
        ['punctuation', '{'],
        ['identifier', 'episodic'],
        ['punctuation', ':'],
        ['keyword', 'EpisodicMemory'],
        ['punctuation', '{'],
        ['identifier', 'maxEvents'],
        ['punctuation', ':'],
        ['number', '500'],
        ['punctuation', '}'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.episodic).toBeDefined();
      expect(result!.episodic!.type).toBe('episodic-memory');
    });

    it('should parse memory block with procedural sub-block', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'SkillMem'],
        ['punctuation', '{'],
        ['identifier', 'procedural'],
        ['punctuation', ':'],
        ['identifier', 'ProceduralMemory'],
        ['punctuation', '{'],
        ['identifier', 'skills'],
        ['punctuation', ':'],
        ['number', '10'],
        ['punctuation', '}'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.procedural).toBeDefined();
      expect(result!.procedural!.type).toBe('procedural-memory');
    });

    it('should handle memory without braces', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'SimpleMem'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('SimpleMem');
      expect(result!.semantic).toBeUndefined();
      expect(result!.episodic).toBeUndefined();
      expect(result!.procedural).toBeUndefined();
    });

    it('should skip unknown sub-blocks gracefully', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'TestMem'],
        ['punctuation', '{'],
        ['identifier', 'unknown'],
        ['punctuation', ':'],
        ['identifier', 'FooType'],
        ['punctuation', '{'],
        ['identifier', 'x'],
        ['punctuation', ':'],
        ['number', '1'],
        ['punctuation', '}'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('TestMem');
      // Unknown sub-blocks should not populate semantic/episodic/procedural
      expect(result!.semantic).toBeUndefined();
      expect(result!.episodic).toBeUndefined();
      expect(result!.procedural).toBeUndefined();
    });

    it('should handle comma-separated sub-blocks', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'FullMem'],
        ['punctuation', '{'],
        ['identifier', 'semantic'],
        ['punctuation', ':'],
        ['identifier', 'SemanticMemory'],
        ['punctuation', '{'],
        ['punctuation', '}'],
        ['punctuation', ','],
        ['identifier', 'episodic'],
        ['punctuation', ':'],
        ['keyword', 'EpisodicMemory'],
        ['punctuation', '{'],
        ['punctuation', '}'],
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.semantic).toBeDefined();
      expect(result!.episodic).toBeDefined();
    });
    it('should parse all three memory types in one block', () => {
      const tokens = makeTokens([
        ['keyword', 'memory'],
        ['identifier', 'CompleteMem'],
        ['punctuation', '{'],
        // semantic sub-block
        ['identifier', 'semantic'],
        ['punctuation', ':'],
        ['identifier', 'SemanticMemory'],
        ['punctuation', '{'],
        ['identifier', 'capacity'],
        ['punctuation', ':'],
        ['number', '1000'],
        ['punctuation', '}'],
        ['punctuation', ','],
        // episodic sub-block
        ['identifier', 'episodic'],
        ['punctuation', ':'],
        ['keyword', 'EpisodicMemory'],
        ['punctuation', '{'],
        ['identifier', 'maxEvents'],
        ['punctuation', ':'],
        ['number', '500'],
        ['punctuation', '}'],
        ['punctuation', ','],
        // procedural sub-block
        ['identifier', 'procedural'],
        ['punctuation', ':'],
        ['identifier', 'ProceduralMemory'],
        ['punctuation', '{'],
        ['identifier', 'skills'],
        ['punctuation', ':'],
        ['number', '10'],
        ['punctuation', '}'],
        // close memory
        ['punctuation', '}'],
      ]);
      const ctx = makeContext(tokens);
      const parser = new HoloScriptPersistenceParser(ctx);
      const result = parser.parseMemory();

      expect(result).not.toBeNull();
      expect(result!.name).toBe('CompleteMem');
      // All three memory sub-blocks should be populated
      expect(result!.semantic).toBeDefined();
      expect(result!.semantic!.type).toBe('semantic-memory');
      expect(result!.semantic!.properties).toHaveProperty('capacity', '1000');
      expect(result!.episodic).toBeDefined();
      expect(result!.episodic!.type).toBe('episodic-memory');
      expect(result!.episodic!.properties).toHaveProperty('maxEvents', '500');
      expect(result!.procedural).toBeDefined();
      expect(result!.procedural!.type).toBe('procedural-memory');
      expect(result!.procedural!.properties).toHaveProperty('skills', '10');
    });
  });
});
