// @ts-nocheck
'use client';
/**
 * useScripting — Hook for HoloScript REPL console
 */
import { useState, useCallback, useRef } from 'react';
import { HoloScriptRuntime } from '@holoscript/core';

export interface ReplEntry {
  id: number;
  input: string;
  output: string;
  success: boolean;
  timestamp: number;
}

export interface UseScriptingReturn {
  runtime: HoloScriptRuntime;
  history: ReplEntry[];
  variables: Array<{ name: string; value: string }>;
  evaluate: (code: string) => Promise<void>;
  setVariable: (name: string, value: any) => void;
  clearHistory: () => void;
  reset: () => void;
}

export function useScripting(): UseScriptingReturn {
  const rtRef = useRef(new HoloScriptRuntime());
  const [history, setHistory] = useState<ReplEntry[]>([]);
  const [variables, setVariables] = useState<Array<{ name: string; value: string }>>([]);
  const nextId = useRef(0);

  const syncVars = useCallback(() => {
    // Read some common variables
    const vars: Array<{ name: string; value: string }> = [];
    for (const name of ['result', 'x', 'y', 'z', 'count', 'name', 'world']) {
      try {
        const v = rtRef.current.getVariable(name);
        if (v !== undefined && v !== null) vars.push({ name, value: JSON.stringify(v) });
      } catch {
        /* not defined */
      }
    }
    setVariables(vars);
  }, []);

  const evaluate = useCallback(
    async (code: string) => {
      const id = nextId.current++;
      try {
        // Use evaluateExpression for simple expressions
        const result = rtRef.current.evaluateExpression(code);
        const output = result !== undefined ? JSON.stringify(result, null, 2) : 'undefined';
        setHistory((prev) => [
          ...prev,
          { id, input: code, output, success: true, timestamp: Date.now() },
        ]);
      } catch (err: any) {
        setHistory((prev) => [
          ...prev,
          {
            id,
            input: code,
            output: err?.message || 'Error',
            success: false,
            timestamp: Date.now(),
          },
        ]);
      }
      syncVars();
    },
    [syncVars]
  );

  const setVariable = useCallback(
    (name: string, value: any) => {
      rtRef.current.setVariable(name, value);
      syncVars();
    },
    [syncVars]
  );

  const clearHistory = useCallback(() => setHistory([]), []);
  const reset = useCallback(() => {
    rtRef.current = new HoloScriptRuntime();
    setHistory([]);
    setVariables([]);
  }, []);

  return { runtime: rtRef.current, history, variables, evaluate, setVariable, clearHistory, reset };
}
