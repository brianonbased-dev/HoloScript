// @vitest-environment jsdom
/**
 * Since #563 the .holo parser refuses blank source with HS1001. A comment-only
 * editor buffer is an empty scene, not an error. Twin: fails on main.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScenePipeline } from '../useScenePipeline';

const mockParse = vi.fn();
vi.mock('@holoscript/core', () => ({
  HoloScriptPlusParser: vi.fn().mockImplementation(function () { return { parse: mockParse }; }),
  HoloCompositionParser: vi.fn().mockImplementation(function () { return { parse: mockParse }; }),
  SceneIRCompiler: vi.fn().mockImplementation(function () { return { compile: vi.fn(), compileComposition: vi.fn() }; }),
}));

const HS1001 = { message: 'Source is empty (HS1001): nothing but whitespace and comments.', code: 'HS1001', line: 1 };

describe('useScenePipeline blank .holo (HS1001)', () => {
  beforeEach(() => mockParse.mockReset());

  it('comment-only .holo buffer renders an empty scene, not an error', () => {
    mockParse.mockReturnValue({ success: false, ast: { type: 'Composition', objects: [] }, errors: [HS1001] });
    const { result } = renderHook(() => useScenePipeline('// new scene\n', { formatHint: 'holo' }));
    expect(result.current).toEqual({ r3fTree: null, errors: [] });
  });

  it('still reports real parse errors next to HS1001', () => {
    mockParse.mockReturnValue({ success: false, errors: [HS1001, { message: 'Unexpected token', code: 'HS0002', line: 2 }] });
    const { result } = renderHook(() => useScenePipeline('composition {', { formatHint: 'holo' }));
    expect(result.current.errors).toHaveLength(2);
  });
});
