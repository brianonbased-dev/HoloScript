// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScenePipeline } from '../useScenePipeline';

// Mock @holoscript/core
const mockParse = vi.fn();
const mockCompile = vi.fn();
const mockCompileComposition = vi.fn();

vi.mock('@holoscript/core', () => ({
  HoloScriptPlusParser: vi.fn().mockImplementation(function () {
    return { parse: mockParse };
  }),
  HoloCompositionParser: vi.fn().mockImplementation(function () {
    return { parse: mockParse };
  }),
  R3FCompiler: vi.fn().mockImplementation(function () {
    return { compile: mockCompile, compileComposition: mockCompileComposition };
  }),
}));

describe('useScenePipeline', () => {
  beforeEach(() => {
    mockParse.mockClear();
    mockCompile.mockClear();
    mockCompileComposition.mockClear();
  });

  describe('Initial State', () => {
    it('should return null tree and empty errors for empty code', () => {
      const { result } = renderHook(() => useScenePipeline(''));

      expect(result.current).toEqual({
        r3fTree: null,
        errors: [],
      });
    });

    it('should return null tree and empty errors for whitespace-only code', () => {
      const { result } = renderHook(() => useScenePipeline('   \n\t  '));

      expect(result.current).toEqual({
        r3fTree: null,
        errors: [],
      });
    });

    it('should not call parser for empty code', () => {
      renderHook(() => useScenePipeline(''));

      expect(mockParse).not.toHaveBeenCalled();
    });
  });

  describe('HoloScriptPlus Format', () => {
    it('should parse .hsplus format by default', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode', children: [] });

      const code = 'scene "Main" { box(); }';
      const { result } = renderHook(() => useScenePipeline(code));

      expect(mockParse).toHaveBeenCalledWith(code);
      expect(mockCompile).toHaveBeenCalled();
      expect(result.current.r3fTree).toEqual({ type: 'R3FNode', children: [] });
      expect(result.current.errors).toEqual([]);
    });

    it('should handle parse result without ast field', () => {
      mockParse.mockReturnValue({ type: 'Scene', errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const { result } = renderHook(() => useScenePipeline('scene Main {}'));

      expect(mockCompile).toHaveBeenCalledWith({ type: 'Scene', errors: [] });
      expect(result.current.r3fTree).toEqual({ type: 'R3FNode' });
    });

    it('should return errors from .hsplus parser', () => {
      mockParse.mockReturnValue({
        errors: [
          { message: 'Unexpected token', line: 5 },
          { message: 'Missing semicolon', line: 10 },
        ],
      });

      const { result } = renderHook(() => useScenePipeline('scene "Bad" {'));

      expect(result.current.r3fTree).toBeNull();
      expect(result.current.errors).toEqual([
        { message: 'Unexpected token', line: 5 },
        { message: 'Missing semicolon', line: 10 },
      ]);
    });

    it('should handle string error messages', () => {
      mockParse.mockReturnValue({
        errors: ['Syntax error on line 3'],
      });

      const { result } = renderHook(() => useScenePipeline('bad code'));

      expect(result.current.errors).toEqual([
        { message: 'Syntax error on line 3', line: undefined },
      ]);
    });

    it('should handle error objects without message field', () => {
      const errorObj = { code: 'E001', line: 5 };
      mockParse.mockReturnValue({
        errors: [errorObj],
      });

      const { result } = renderHook(() => useScenePipeline('bad code'));

      expect(result.current.errors[0].message).toBe(String(errorObj));
    });
  });

  describe('HoloComposition Format', () => {
    it('should detect composition format', () => {
      mockParse.mockReturnValue({ ast: { type: 'Composition' }, errors: [] });
      mockCompileComposition.mockReturnValue({ type: 'R3FComposition' });

      const code = 'composition "MyComp" { }';
      const { result } = renderHook(() => useScenePipeline(code));

      expect(mockParse).toHaveBeenCalledWith(code);
      expect(mockCompileComposition).toHaveBeenCalled();
      expect(mockCompile).not.toHaveBeenCalled();
      expect(result.current.r3fTree).toEqual({ type: 'R3FComposition' });
    });

    it('should detect composition with leading whitespace', () => {
      mockParse.mockReturnValue({ ast: { type: 'Composition' }, errors: [] });
      mockCompileComposition.mockReturnValue({ type: 'R3FComposition' });

      const code = '   \n\t  composition "Whitespace" { }';
      renderHook(() => useScenePipeline(code));

      expect(mockCompileComposition).toHaveBeenCalled();
      expect(mockCompile).not.toHaveBeenCalled();
    });

    it('should return errors from composition parser', () => {
      mockParse.mockReturnValue({
        errors: [{ message: 'Invalid composition', line: 2 }],
      });

      const { result } = renderHook(() => useScenePipeline('composition "Bad" {'));

      expect(result.current.r3fTree).toBeNull();
      expect(result.current.errors).toEqual([{ message: 'Invalid composition', line: 2 }]);
    });

    it('should handle composition result without ast field', () => {
      mockParse.mockReturnValue({ type: 'Composition', errors: [] });
      mockCompileComposition.mockReturnValue({ type: 'R3FComp' });

      const { result } = renderHook(() => useScenePipeline('composition Test {}'));

      expect(mockCompileComposition).toHaveBeenCalledWith({ type: 'Composition', errors: [] });
      expect(result.current.r3fTree).toEqual({ type: 'R3FComp' });
    });
  });

  describe('Format Detection', () => {
    it('should not detect composition in middle of code', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const code = 'scene Main { /* composition keyword here */ }';
      renderHook(() => useScenePipeline(code));

      expect(mockCompile).toHaveBeenCalled();
      expect(mockCompileComposition).not.toHaveBeenCalled();
    });

    it('should trim start before checking format', () => {
      mockParse.mockReturnValue({ ast: { type: 'Composition' }, errors: [] });
      mockCompileComposition.mockReturnValue({ type: 'R3FComp' });

      const code = '\n\n   composition Test {}';
      renderHook(() => useScenePipeline(code));

      expect(mockCompileComposition).toHaveBeenCalled();
    });

    it('should use hsplus for code starting with comments', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const code = '// comment\nscene Main {}';
      renderHook(() => useScenePipeline(code));

      expect(mockCompile).toHaveBeenCalled();
      expect(mockCompileComposition).not.toHaveBeenCalled();
    });
  });

  describe('Compilation Errors', () => {
    it('should catch and return compiler exceptions', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockImplementation(() => {
        throw new Error('Compilation failed');
      });

      const { result } = renderHook(() => useScenePipeline('scene Test {}'));

      expect(result.current.r3fTree).toBeNull();
      expect(result.current.errors).toEqual([{ message: 'Compilation failed' }]);
    });

    it('should handle non-Error exceptions', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockImplementation(() => {
        throw 'String error';
      });

      const { result } = renderHook(() => useScenePipeline('scene Test {}'));

      expect(result.current.errors).toEqual([{ message: 'String error' }]);
    });

    it('should catch composition compiler exceptions', () => {
      mockParse.mockReturnValue({ ast: { type: 'Composition' }, errors: [] });
      mockCompileComposition.mockImplementation(() => {
        throw new Error('Composition compile failed');
      });

      const { result } = renderHook(() => useScenePipeline('composition Test {}'));

      expect(result.current.r3fTree).toBeNull();
      expect(result.current.errors).toEqual([{ message: 'Composition compile failed' }]);
    });
  });

  describe('Memoization', () => {
    it('should memoize result when code does not change', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const code = 'scene Main {}';
      const { result, rerender } = renderHook(({ codeInput }) => useScenePipeline(codeInput), {
        initialProps: { codeInput: code },
      });

      const firstResult = result.current;
      mockParse.mockClear();
      mockCompile.mockClear();

      rerender({ codeInput: code });

      expect(result.current).toBe(firstResult);
      expect(mockParse).not.toHaveBeenCalled();
      expect(mockCompile).not.toHaveBeenCalled();
    });

    it('should recompute when code changes', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const { result, rerender } = renderHook(({ codeInput }) => useScenePipeline(codeInput), {
        initialProps: { codeInput: 'scene Main {}' },
      });

      const firstResult = result.current;
      mockParse.mockClear();
      mockCompile.mockClear();

      rerender({ codeInput: 'scene Changed {}' });

      expect(result.current).not.toBe(firstResult);
      expect(mockParse).toHaveBeenCalledWith('scene Changed {}');
      expect(mockCompile).toHaveBeenCalled();
    });

    it('should recompute when switching formats', () => {
      mockParse.mockReturnValue({ ast: {}, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });
      mockCompileComposition.mockReturnValue({ type: 'R3FComp' });

      const { result, rerender } = renderHook(({ codeInput }) => useScenePipeline(codeInput), {
        initialProps: { codeInput: 'scene Main {}' },
      });

      expect(mockCompile).toHaveBeenCalled();
      expect(mockCompileComposition).not.toHaveBeenCalled();

      mockCompile.mockClear();
      mockParse.mockClear();

      rerender({ codeInput: 'composition Test {}' });

      expect(mockCompileComposition).toHaveBeenCalled();
      expect(mockCompile).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle code with only spaces', () => {
      const { result } = renderHook(() => useScenePipeline('     '));

      expect(result.current).toEqual({
        r3fTree: null,
        errors: [],
      });
    });

    it('should handle code with only tabs and newlines', () => {
      const { result } = renderHook(() => useScenePipeline('\t\n\t\n'));

      expect(result.current).toEqual({
        r3fTree: null,
        errors: [],
      });
    });

    it('should handle very long code', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const longCode = 'scene Main {\n' + '  box();\n'.repeat(1000) + '}';
      const { result } = renderHook(() => useScenePipeline(longCode));

      expect(mockParse).toHaveBeenCalledWith(longCode);
      expect(result.current.r3fTree).toBeTruthy();
    });

    it('should handle code with unicode characters', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const code = 'scene "テスト" { box(); }';
      renderHook(() => useScenePipeline(code));

      expect(mockParse).toHaveBeenCalledWith(code);
    });

    it('should handle multiple errors', () => {
      mockParse.mockReturnValue({
        errors: [
          { message: 'Error 1', line: 1 },
          { message: 'Error 2', line: 2 },
          { message: 'Error 3', line: 3 },
          'String error 4',
        ],
      });

      const { result } = renderHook(() => useScenePipeline('bad code'));

      expect(result.current.errors).toHaveLength(4);
      expect(result.current.errors[3]).toEqual({
        message: 'String error 4',
        line: undefined,
      });
    });

    it('should handle empty errors array', () => {
      mockParse.mockReturnValue({ ast: { type: 'Scene' }, errors: [] });
      mockCompile.mockReturnValue({ type: 'R3FNode' });

      const { result } = renderHook(() => useScenePipeline('scene Main {}'));

      expect(result.current.errors).toEqual([]);
    });

    it('should handle null ast and result', () => {
      const parseResult = { ast: null, errors: [] };
      mockParse.mockReturnValue(parseResult);
      mockCompile.mockReturnValue(null);

      const { result } = renderHook(() => useScenePipeline('scene Main {}'));

      // Hook uses result.ast ?? result, so passes full result when ast is null
      expect(mockCompile).toHaveBeenCalledWith(parseResult);
      expect(result.current.r3fTree).toBeNull();
    });
  });
});
