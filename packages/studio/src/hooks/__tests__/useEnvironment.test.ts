// @vitest-environment jsdom
/**
 * useEnvironment.test.ts
 * Tests for environment block management hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEnvironment } from '../useEnvironment';
import { useSceneStore } from '@/lib/store';

// Mock useSceneStore
vi.mock('@/lib/store', () => ({
  useSceneStore: vi.fn(),
}));

describe('useEnvironment', () => {
  const mockSetCode = vi.fn();

  beforeEach(() => {
    mockSetCode.mockClear();

    // Default mock: empty code
    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = {
        code: '',
        setCode: mockSetCode,
      };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should start with no environment block', () => {
      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(false);
      expect(result.current.rawBlock).toBeNull();
    });

    it('should provide applyPreset and removeEnvironment functions', () => {
      const { result } = renderHook(() => useEnvironment());

      expect(typeof result.current.applyPreset).toBe('function');
      expect(typeof result.current.removeEnvironment).toBe('function');
    });
  });

  describe('Parse Environment Block', () => {
    it('should detect environment block', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}\nenvironment {\n  skybox("space");\n}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toBe('environment {\n  skybox("space");\n}');
    });

    it('should parse environment block with various whitespace', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'environment{skybox();}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toBe('environment{skybox();}');
    });

    it('should parse environment block with multiline content', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: `scene Main {}
environment {
  skybox("desert");
  fog(0.5);
  ambient(#ffffff);
}`,
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toContain('skybox("desert")');
      expect(result.current.rawBlock).toContain('fog(0.5)');
    });

    it('should return null for code without environment block', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main { box(); }',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(false);
      expect(result.current.rawBlock).toBeNull();
    });

    it('should handle empty code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: '',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(false);
      expect(result.current.rawBlock).toBeNull();
    });

    it('should handle null code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: null,
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(false);
      expect(result.current.rawBlock).toBeNull();
    });
  });

  describe('Apply Preset', () => {
    it('should insert environment block when none exists', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main { box(); }',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.applyPreset('  skybox("space");');
      });

      expect(mockSetCode).toHaveBeenCalledWith(
        'scene Main { box(); }\n\nenvironment {\n  skybox("space");\n}\n'
      );
    });

    it('should replace existing environment block', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}\nenvironment {\n  skybox("old");\n}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.applyPreset('  skybox("new");');
      });

      expect(mockSetCode).toHaveBeenCalledWith(
        'scene Main {}\nenvironment {\n  skybox("new");\n}'
      );
    });

    it('should format preset with proper indentation', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.applyPreset('  skybox("desert");\n  fog(0.5);');
      });

      const expectedBlock = 'environment {\n  skybox("desert");\n  fog(0.5);\n}\n';
      expect(mockSetCode).toHaveBeenCalledWith(
        'scene Main {}\n\n' + expectedBlock
      );
    });

    it('should insert at end of empty code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: '',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.applyPreset('  ambient(#ffffff);');
      });

      expect(mockSetCode).toHaveBeenCalledWith(
        '\n\nenvironment {\n  ambient(#ffffff);\n}\n'
      );
    });

    it('should replace environment block preserving surrounding code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}\nenvironment {\n  old();\n}\n\n',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.applyPreset('  new();');
      });

      // Should replace the environment block (trimEnd applied to block itself)
      const call = mockSetCode.mock.calls[0][0];
      expect(call).toBe('scene Main {}\nenvironment {\n  new();\n}\n\n');
    });
  });

  describe('Remove Environment', () => {
    it('should remove environment block from code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}\nenvironment {\n  skybox();\n}\nbox();',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.removeEnvironment();
      });

      expect(mockSetCode).toHaveBeenCalledWith('scene Main {}\nbox();');
    });

    it('should trim trailing whitespace after removal', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}\nenvironment {\n  skybox();\n}\n\n\n',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.removeEnvironment();
      });

      expect(mockSetCode).toHaveBeenCalledWith('scene Main {}');
    });

    it('should handle removal when no environment exists', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main { box(); }',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.removeEnvironment();
      });

      // Should still call setCode, just with same content trimmed
      expect(mockSetCode).toHaveBeenCalledWith('scene Main { box(); }');
    });

    it('should remove environment at start of code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'environment {\n  skybox();\n}\nscene Main {}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.removeEnvironment();
      });

      expect(mockSetCode).toHaveBeenCalledWith('scene Main {}');
    });

    it('should remove environment in middle of code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}\nenvironment { sky(); }\nbox();',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.removeEnvironment();
      });

      expect(mockSetCode).toHaveBeenCalledWith('scene Main {}\nbox();');
    });
  });

  describe('Code Updates', () => {
    it('should update state when code changes', () => {
      let currentCode = 'scene Main {}';

      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: currentCode,
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result, rerender } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(false);

      // Update code to include environment
      currentCode = 'scene Main {}\nenvironment { skybox(); }';
      rerender();

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toBe('environment { skybox(); }');
    });

    it('should re-parse when code changes', () => {
      let currentCode = 'environment { old(); }';

      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: currentCode,
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result, rerender } = renderHook(() => useEnvironment());

      expect(result.current.rawBlock).toBe('environment { old(); }');

      // Change code
      currentCode = 'environment { new(); }';
      rerender();

      expect(result.current.rawBlock).toBe('environment { new(); }');
    });
  });

  describe('Edge Cases', () => {
    it('should handle environment block with nested braces', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'environment {\n  trait { prop: value; }\n}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toContain('trait { prop: value; }');
    });

    it('should be stable across re-renders with same code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result, rerender } = renderHook(() => useEnvironment());

      const firstApplyPreset = result.current.applyPreset;
      const firstRemoveEnvironment = result.current.removeEnvironment;

      rerender();

      // Functions should be stable (useCallback)
      expect(result.current.applyPreset).toBe(firstApplyPreset);
      expect(result.current.removeEnvironment).toBe(firstRemoveEnvironment);
    });

    it('should handle multiple environment blocks (takes first)', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'environment { first(); }\nenvironment { second(); }',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      // Regex will match first occurrence
      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toBe('environment { first(); }');
    });

    it('should handle empty environment block', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'environment {}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toBe('environment {}');
    });

    it('should handle environment block with only whitespace', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'environment {   \n   }',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      expect(result.current.hasEnvironment).toBe(true);
      expect(result.current.rawBlock).toBe('environment {   \n   }');
    });
  });

  describe('Regression Tests', () => {
    it('should not match partial keyword "environment"', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'my_environment_var = 5;',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      // Should NOT match partial keyword
      expect(result.current.hasEnvironment).toBe(false);
    });

    it('should handle applyPreset with empty string', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = {
          code: 'scene Main {}',
          setCode: mockSetCode,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useEnvironment());

      act(() => {
        result.current.applyPreset('');
      });

      expect(mockSetCode).toHaveBeenCalledWith(
        'scene Main {}\n\nenvironment {\n\n}\n'
      );
    });
  });
});
