'use client';
/**
 * useSecurity — Hook for sandbox execution and security analysis
 */
import { useState, useCallback, useRef } from 'react';
import {
  createSandbox,
  executeSandbox,
  destroySandbox,
  type Sandbox,
  type SandboxExecutionResult,
} from '@holoscript/core';

export interface UseSecurityReturn {
  sandbox: Sandbox | null;
  results: SandboxExecutionResult[];
  isRunning: boolean;
  createNewSandbox: () => void;
  executeCode: (code: string) => Promise<void>;
  destroyCurrentSandbox: () => void;
  runDemo: () => Promise<void>;
  clearResults: () => void;
}

const DEMO_SNIPPETS = [
  { label: 'Math', code: 'const result = Math.sqrt(144) + Math.PI;\nresult;' },
  {
    label: 'String',
    code: 'const greeting = "Hello, HoloScript!";\ngreeting.split("").reverse().join("");',
  },
  {
    label: 'JSON',
    code: 'JSON.stringify({ world: "HoloLand", version: 5.0, entities: 42 }, null, 2);',
  },
  { label: 'Blocked', code: 'process.exit(1);' },
];

export function useSecurity(): UseSecurityReturn {
  const sandboxRef = useRef<Sandbox | null>(null);
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [results, setResults] = useState<SandboxExecutionResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const createNewSandbox = useCallback(() => {
    if (sandboxRef.current) destroySandbox(sandboxRef.current);
    const sb = createSandbox({
      maxMemoryBytes: 10 * 1024 * 1024,
      maxCpuTimeMs: 3000,
      allowedModules: [],
      blockedGlobals: ['process', 'require', '__dirname', '__filename', 'eval'],
      allowFileSystem: false,
      allowNetwork: false,
      allowChildProcess: false,
    });
    sandboxRef.current = sb;
    setSandbox(sb);
  }, []);

  const executeCode = useCallback(
    async (code: string) => {
      if (!sandboxRef.current) createNewSandbox();
      if (!sandboxRef.current) return;
      setIsRunning(true);
      try {
        const result = await executeSandbox(code, sandboxRef.current);
        setResults((prev) => [...prev, result]);
        setSandbox({ ...sandboxRef.current });
      } catch {
        setResults((prev) => [
          ...prev,
          { success: false, error: 'Execution failed', memoryUsed: 0, cpuTimeUsed: 0 },
        ]);
      }
      setIsRunning(false);
    },
    [createNewSandbox]
  );

  const destroyCurrentSandbox = useCallback(() => {
    if (sandboxRef.current) {
      destroySandbox(sandboxRef.current);
      sandboxRef.current = null;
      setSandbox(null);
    }
  }, []);

  const runDemo = useCallback(async () => {
    createNewSandbox();
    for (const snippet of DEMO_SNIPPETS) {
      await executeCode(snippet.code);
    }
  }, [createNewSandbox, executeCode]);

  const clearResults = useCallback(() => setResults([]), []);

  return {
    sandbox,
    results,
    isRunning,
    createNewSandbox,
    executeCode,
    destroyCurrentSandbox,
    runDemo,
    clearResults,
  };
}

export { DEMO_SNIPPETS };
