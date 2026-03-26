// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useScriptConsole } from '../useScriptConsole';
import { useSceneStore } from '@/lib/stores';

vi.mock('@/lib/stores', () => ({
  useSceneStore: vi.fn(),
}));

describe('useScriptConsole', () => {
  let mockCode: string;

  beforeEach(() => {
    mockCode = 'scene "Main" {}\nobject "box1" {}';

    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should start with welcome message', () => {
      const { result } = renderHook(() => useScriptConsole());

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].level).toBe('info');
      expect(result.current.entries[0].content).toContain('Console ready');
    });

    it('should have empty input', () => {
      const { result } = renderHook(() => useScriptConsole());

      expect(result.current.input).toBe('');
    });
  });

  describe('Evaluate', () => {
    it('should evaluate simple expressions', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('1 + 1');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.level).toBe('result');
      expect(lastEntry.content).toBe('2');
    });

    it('should provide scene proxy', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('scene.lineCount');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toBe('2');
    });

    it('should extract object names from code', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('scene.objects');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toContain('box1');
    });

    it('should capture console.log', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('console.log("test")');
      });

      expect(result.current.entries.some((e) => e.content === 'test' && e.level === 'log')).toBe(
        true
      );
    });

    it('should capture console.warn', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('console.warn("warning")');
      });

      expect(
        result.current.entries.some((e) => e.content === 'warning' && e.level === 'warn')
      ).toBe(true);
    });

    it('should capture console.error', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('console.error("error")');
      });

      expect(result.current.entries.some((e) => e.content === 'error' && e.level === 'error')).toBe(
        true
      );
    });

    it('should catch evaluation errors', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('invalidSyntax)(');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.level).toBe('error');
    });

    it('should skip empty expressions', () => {
      const { result } = renderHook(() => useScriptConsole());

      const initialLength = result.current.entries.length;

      act(() => {
        result.current.evaluate('   ');
      });

      expect(result.current.entries.length).toBe(initialLength);
    });

    it('should add expression to history', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('1 + 1');
      });

      const logEntry = result.current.entries.find((e) => e.content === '> 1 + 1');
      expect(logEntry).toBeDefined();
    });
  });

  describe('Clear', () => {
    it('should clear entries', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('1 + 1');
      });

      act(() => {
        result.current.clear();
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].content).toContain('cleared');
    });
  });

  describe('History Navigation', () => {
    beforeEach(() => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('first');
        result.current.evaluate('second');
        result.current.evaluate('third');
      });
    });

    it('should navigate up through history', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('cmd1');
        result.current.evaluate('cmd2');
      });

      act(() => {
        result.current.historyUp();
      });

      expect(result.current.input).toBe('cmd2');

      act(() => {
        result.current.historyUp();
      });

      expect(result.current.input).toBe('cmd1');
    });

    it('should navigate down through history', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('cmd1');
        result.current.evaluate('cmd2');
      });

      act(() => {
        result.current.historyUp();
        result.current.historyUp();
      });

      act(() => {
        result.current.historyDown();
      });

      expect(result.current.input).toBe('cmd2');
    });

    it('should clear input at bottom of history', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('cmd');
      });

      act(() => {
        result.current.historyUp();
      });

      act(() => {
        result.current.historyDown();
      });

      expect(result.current.input).toBe('');
    });
  });

  describe('Safe Stringify', () => {
    it('should stringify null', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('null');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toBe('null');
    });

    it('should stringify undefined', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('undefined');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toBe('undefined');
    });

    it('should stringify arrays', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('[1, 2, 3]');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toContain('[1, 2, 3]');
    });

    it('should truncate long arrays', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('[1,2,3,4,5,6,7,8,9,10]');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toContain('…');
    });

    it('should stringify objects', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        result.current.evaluate('({ a: 1, b: 2 })');
      });

      const lastEntry = result.current.entries[result.current.entries.length - 1];
      expect(lastEntry.content).toContain('a: 1');
      expect(lastEntry.content).toContain('b: 2');
    });
  });

  describe('Entry Limits', () => {
    it('should cap entries at 200', () => {
      const { result } = renderHook(() => useScriptConsole());

      act(() => {
        for (let i = 0; i < 250; i++) {
          result.current.evaluate(`${i}`);
        }
      });

      expect(result.current.entries.length).toBeLessThanOrEqual(200);
    });
  });
});
