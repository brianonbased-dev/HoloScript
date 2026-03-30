'use client';

/**
 * useScriptConsole — sandboxed JS/HoloScript REPL hook.
 * Evaluates expressions in a safe context, captures output + errors.
 */

import { useState, useCallback, useRef } from 'react';
import { useSceneStore } from '@/lib/stores';

export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'result';

export interface ConsoleEntry {
  id: string;
  level: LogLevel;
  content: string;
  ts: number;
}

let _entryCounter = 0;
function mkEntry(level: LogLevel, content: string): ConsoleEntry {
  return { id: `ce-${++_entryCounter}`, level, content, ts: Date.now() };
}

function safeStringify(val: unknown, depth = 0): string {
  if (depth > 3) return '[…]';
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
  if (typeof val === 'symbol') return val.toString();
  if (typeof val !== 'object') return String(val);
  if (Array.isArray(val)) {
    const items = val.slice(0, 8).map((v) => safeStringify(v, depth + 1));
    return `[${items.join(', ')}${val.length > 8 ? ', …' : ''}]`;
  }
  try {
    const keys = Object.keys(val as object).slice(0, 6);
    const pairs = keys.map(
      (k) => `${k}: ${safeStringify((val as Record<string, unknown>)[k], depth + 1)}`
    );
    return `{ ${pairs.join(', ')}${Object.keys(val as object).length > 6 ? ' …' : ''} }`;
  } catch {
    return String(val);
  }
}

export function useScriptConsole() {
  const code = useSceneStore((s) => s.code) ?? '';
  const [entries, setEntries] = useState<ConsoleEntry[]>([
    mkEntry('info', 'HoloScript Console ready. Type JS expressions or use scene.* helpers.'),
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const pushRef = useRef((e: ConsoleEntry) => setEntries((prev) => [...prev.slice(-199), e]));

  const push = pushRef.current;

  const evaluate = useCallback(
    (expr: string) => {
      if (!expr.trim()) return;
      push(mkEntry('log', `> ${expr}`));
      setHistory((h) => [expr, ...h.slice(0, 49)]);
      setHistIdx(-1);

      // Build a safe scene proxy so expressions can read scene metadata
      const sceneProxy = {
        code,
        lineCount: code.split('\n').length,
        objects: [...code.matchAll(/^object\s+"([^"]+)"/gm)].map((m) => m[1]),
        help: () => 'scene.code, scene.lineCount, scene.objects',
      };

      // Intercept console methods inside eval
      const captured: ConsoleEntry[] = [];
      const fakeConsole = {
        log: (...args: unknown[]) =>
          captured.push(mkEntry('log', args.map(safeStringify).join(' '))),
        warn: (...args: unknown[]) =>
          captured.push(mkEntry('warn', args.map(safeStringify).join(' '))),
        error: (...args: unknown[]) =>
          captured.push(mkEntry('error', args.map(safeStringify).join(' '))),
        info: (...args: unknown[]) =>
          captured.push(mkEntry('info', args.map(safeStringify).join(' '))),
      };

      try {
        const fn = new Function(
          'scene',
          'console',
          'Math',
          'JSON',
          `"use strict"; return (${expr})`
        );
        const result = fn(sceneProxy, fakeConsole, Math, JSON);
        captured.push(mkEntry('result', safeStringify(result)));
      } catch (err) {
        captured.push(mkEntry('error', err instanceof Error ? err.message : String(err)));
      }

      setEntries((prev) => [...prev.slice(-(200 - captured.length)), ...captured]);
    },
    [code, push]
  );

  const clear = useCallback(() => {
    setEntries([mkEntry('info', 'Console cleared.')]);
  }, []);

  const historyUp = useCallback(() => {
    setHistIdx((i) => {
      const next = Math.min(i + 1, history.length - 1);
      if (history[next]) setInput(history[next]);
      return next;
    });
  }, [history]);

  const historyDown = useCallback(() => {
    setHistIdx((i) => {
      const next = Math.max(i - 1, -1);
      setInput(next < 0 ? '' : (history[next] ?? ''));
      return next;
    });
  }, [history]);

  return { entries, input, setInput, evaluate, clear, historyUp, historyDown };
}
