// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @holoscript/core (dynamic-imported by fallback methods) ──────────

const mockParseHolo = vi.fn().mockReturnValue({ type: 'composition', body: [] });
const mockValidate = vi.fn().mockReturnValue([]);
const mockR3FCompile = vi.fn().mockReturnValue({ type: 'group', children: [] });
const mockR3FCompileComposition = vi.fn().mockReturnValue({ type: 'group', children: [] });

vi.mock('@holoscript/core', () => ({
  parseHolo: mockParseHolo,
  HoloScriptValidator: class {
    validate(code: string) {
      return mockValidate(code);
    }
  },
  HoloScriptPlusParser: class {
    parse(source: string) {
      return { ast: { type: 'program', body: [] } };
    }
  },
  HoloCompositionParser: class {
    parse(source: string) {
      return { ast: { type: 'composition', body: [] } };
    }
  },
  R3FCompiler: class {
    compile(ast: unknown) {
      return mockR3FCompile(ast);
    }
    compileComposition(ast: unknown) {
      return mockR3FCompileComposition(ast);
    }
  },
}));

import { CompilerBridge, resetCompilerBridge, getCompilerBridge } from '../wasm-compiler-bridge';

// ─── Mock Worker ────────────────────────────────────────────────────────────

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, handler: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  postMessage(msg: any) {
    const { id, type, payload } = msg;
    setTimeout(() => {
      const response = MockWorker.responseHandler?.(type, payload, id);
      if (response) {
        const event = new MessageEvent('message', { data: { id, ...response } });
        this.listeners.get('message')?.forEach((h) => h(event));
      }
    }, 0);
  }

  terminate() {
    this.listeners.clear();
  }

  static responseHandler:
    | ((
        type: string,
        payload: any,
        id: number
      ) => { type: 'result' | 'error'; payload: any } | null)
    | null = null;
}

vi.stubGlobal(
  'Worker',
  vi.fn().mockImplementation(() => new MockWorker())
);

describe('CompilerBridge', { timeout: 15_000 }, () => {
  let bridge: CompilerBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return values after clearAllMocks wipes them
    mockParseHolo.mockReturnValue({ type: 'composition', body: [] });
    mockValidate.mockReturnValue([]);
    mockR3FCompile.mockReturnValue({ type: 'group', children: [] });
    mockR3FCompileComposition.mockReturnValue({ type: 'group', children: [] });
    // Re-stub Worker to ensure isolation from other test files' Worker mocks
    vi.stubGlobal(
      'Worker',
      vi.fn().mockImplementation(() => new MockWorker())
    );
    resetCompilerBridge();
    bridge = new CompilerBridge();
    // Default response handler: WASM init always "fails" so bridge uses TS fallback
    // Other requests get a generic result to prevent timeouts
    MockWorker.responseHandler = (type, _payload, _id) => {
      if (type === 'init') {
        return { type: 'error', payload: { message: 'WASM not available in test env' } };
      }
      return { type: 'result', payload: {} };
    };
  });

  afterEach(() => {
    bridge.destroy();
    MockWorker.responseHandler = null;
  });

  // ─── Singleton ──────────────────────────────────────────────────

  describe('Singleton', () => {
    it('should return same instance from getCompilerBridge()', () => {
      const a = getCompilerBridge();
      const b = getCompilerBridge();
      expect(a).toBe(b);
    });

    it('should create new instance after resetCompilerBridge()', () => {
      const a = getCompilerBridge();
      resetCompilerBridge();
      const b = getCompilerBridge();
      expect(a).not.toBe(b);
    });
  });

  // ─── Status ─────────────────────────────────────────────────────

  describe('Status', () => {
    it('should start with typescript-fallback status', () => {
      const status = bridge.getStatus();
      expect(status.backend).toBe('typescript-fallback');
      expect(status.wasmLoaded).toBe(false);
      expect(status.world).toBe('none');
    });

    it('should return a copy (not the internal object)', () => {
      const a = bridge.getStatus();
      const b = bridge.getStatus();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });

  // ─── Fallback Parse ─────────────────────────────────────────────

  describe('Fallback Parse', () => {
    it('should call parseHolo from @holoscript/core', async () => {
      const result = await bridge.parse('composition "Test" {}');
      expect(mockParseHolo).toHaveBeenCalledWith('composition "Test" {}');
      expect(result).toHaveProperty('ast');
    });

    it('should return errors when parseHolo throws', async () => {
      mockParseHolo.mockImplementationOnce(() => {
        throw new Error('parse failed');
      });
      const result = await bridge.parse('invalid');
      expect(result).toHaveProperty('errors');
      expect(result.errors![0].severity).toBe('error');
      expect(result.errors![0].message).toContain('parse failed');
    });
  });

  // ─── Fallback Validate ──────────────────────────────────────────

  describe('Fallback Validate', () => {
    it('should return valid: true when no errors', async () => {
      mockValidate.mockReturnValueOnce([]);
      const result = await bridge.validate('composition "Test" {}');
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toEqual([]);
    });

    it('should return valid: false with diagnostics', async () => {
      mockValidate.mockReturnValueOnce([{ message: 'missing semicolon' }]);
      const result = await bridge.validate('bad code');
      expect(result.valid).toBe(false);
      expect(result.diagnostics.length).toBe(1);
      expect(result.diagnostics[0].message).toBe('missing semicolon');
    });
  });

  // ─── Fallback Compile ───────────────────────────────────────────

  describe('Fallback Compile', () => {
    it('should compile threejs target via R3FCompiler', async () => {
      mockR3FCompile.mockReturnValueOnce({ type: 'mesh', name: 'box' });
      const result = await bridge.compile('template "Box" {}', 'threejs');
      expect(result.type).toBe('text');
    });

    it('should compile composition format with compileComposition', async () => {
      mockR3FCompileComposition.mockReturnValueOnce({ type: 'group', children: [] });
      const result = await bridge.compile('composition "Test" { object "A" {} }', 'threejs');
      expect(result.type).toBe('text');
    });

    it('should return error for unsupported target', async () => {
      const result = await bridge.compile('template "Box" {}', 'unity' as any);
      expect(result.type).toBe('error');
    });
  });

  // ─── Fallback Generate ──────────────────────────────────────────

  describe('Fallback Generate', () => {
    it('should generate template object', async () => {
      const result = await bridge.generateObject('a glowing sphere');
      expect(result).toContain('object');
      expect(result).toContain('Generated');
      expect(result).toContain('a glowing sphere');
    });

    it('should generate template scene', async () => {
      const result = await bridge.generateScene('a battle arena');
      expect(result).toContain('composition');
      expect(result).toContain('Generated Scene');
      expect(result).toContain('a battle arena');
    });
  });

  // ─── Fallback Suggest Traits ────────────────────────────────────

  describe('Fallback Suggest Traits', () => {
    it('should suggest grabbable for interactive descriptions', async () => {
      const traits = await bridge.suggestTraits('a grabbable glowing orb');
      expect(traits.some((t) => t.name === 'grabbable')).toBe(true);
      expect(traits.some((t) => t.name === 'glowing')).toBe(true);
    });

    it('should suggest physics traits for physics descriptions', async () => {
      const traits = await bridge.suggestTraits('a bouncing ball with physics');
      expect(traits.some((t) => t.name === 'physics')).toBe(true);
      expect(traits.some((t) => t.name === 'collidable')).toBe(true);
    });

    it('should suggest networked for multiplayer descriptions', async () => {
      const traits = await bridge.suggestTraits('a multiplayer synced object');
      expect(traits.some((t) => t.name === 'networked')).toBe(true);
    });

    it('should return empty for unrelated descriptions', async () => {
      const traits = await bridge.suggestTraits('a simple static cube');
      expect(traits).toEqual([]);
    });
  });

  // ─── Fallback List Traits ──────────────────────────────────────

  describe('Fallback List Traits', () => {
    it('should list core traits', async () => {
      const traits = await bridge.listTraits();
      expect(traits.length).toBeGreaterThan(0);
      expect(traits[0]).toHaveProperty('name');
      expect(traits[0]).toHaveProperty('category');
      expect(traits[0]).toHaveProperty('description');
    });

    it('should filter traits by category', async () => {
      const traits = await bridge.listTraitsByCategory('interaction');
      expect(traits.length).toBeGreaterThan(0);
      expect(traits.every((t) => t.category === 'interaction')).toBe(true);
    });

    it('should return empty for unknown category', async () => {
      const traits = await bridge.listTraitsByCategory('nonexistent');
      expect(traits).toEqual([]);
    });
  });

  // ─── Fallback Format / Completions / Types ─────────────────────

  describe('Fallback Format', () => {
    it('should return source unchanged', async () => {
      const source = 'composition "Test" {\n  object "A" {}\n}';
      const formatted = await bridge.format(source);
      expect(formatted).toBe(source);
    });
  });

  describe('Fallback Completions', () => {
    it('should return empty when no worker', async () => {
      const completions = await bridge.completionsAt('scene Main {}', 5);
      expect(completions).toEqual([]);
    });
  });

  describe('Fallback CheckTypes', () => {
    it('should delegate to validation in fallback', async () => {
      mockValidate.mockReturnValueOnce([{ message: 'type error' }]);
      const diags = await bridge.checkTypes('bad code');
      expect(diags.length).toBe(1);
      expect(diags[0].message).toBe('type error');
    });
  });

  // ─── Destroy ───────────────────────────────────────────────────

  describe('Destroy', () => {
    it('should set wasmLoaded to false after destroy', () => {
      bridge.destroy();
      expect(bridge.getStatus().wasmLoaded).toBe(false);
    });

    it('should still work in fallback mode after destroy', async () => {
      bridge.destroy();
      const result = await bridge.generateObject('test object');
      expect(result).toContain('object');
    });
  });
});
