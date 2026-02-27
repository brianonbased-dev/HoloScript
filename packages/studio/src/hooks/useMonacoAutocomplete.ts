'use client';

/**
 * useMonacoAutocomplete — registers an InlineCompletionsProvider with Monaco
 * that calls /api/autocomplete for AI-powered HoloScript completions.
 *
 * Usage: call this hook once inside a component that has Monaco mounted.
 * Pass the monaco instance from the @monaco-editor/react onMount callback.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Monaco } from '@monaco-editor/react';

/** Minimal IDisposable — matches the monaco-editor IDisposable interface. */
interface IDisposable { dispose(): void; }

interface AutocompleteOptions {
  enabled?: boolean;
  debounceMs?: number;
}

export function useMonacoAutocomplete(
  monaco: Monaco | null,
  options?: AutocompleteOptions
) {
  const { enabled = true, debounceMs = 300 } = options ?? {};
  const disposableRef = useRef<IDisposable | null>(null);
  const pendingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCompletion = useCallback(async (prefix: string, suffix: string): Promise<string> => {
    try {
      const res = await fetch('/api/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, suffix, maxTokens: 64 }),
      });
      const data = (await res.json()) as { completion?: string };
      return data.completion ?? '';
    } catch {
      return '';
    }
  }, []);

  useEffect(() => {
    if (!monaco || !enabled) return;

    // Use structural typing for provider params to avoid deep ITextModel
    // resolution differences between the two pnpm installs of monaco-editor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    disposableRef.current = monaco.languages.registerInlineCompletionsProvider('holo', {
      provideInlineCompletions(
        model: {
          getValueInRange: (r: unknown) => string;
          getLineCount: () => number;
          getLineMaxColumn: (l: number) => number;
        },
        position: { lineNumber: number; column: number },
        _context: unknown,
        token: { isCancellationRequested: boolean }
      ) {
        return new Promise((resolve) => {
          if (pendingRef.current) clearTimeout(pendingRef.current);

          pendingRef.current = setTimeout(async () => {
            if (token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            const prefix = model.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            const endLine = model.getLineCount();
            const suffix = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: endLine,
              endColumn: model.getLineMaxColumn(endLine),
            });

            const completion = await fetchCompletion(prefix, suffix);
            if (!completion || token.isCancellationRequested) {
              resolve({ items: [] });
              return;
            }

            resolve({
              items: [{
                insertText: completion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              }],
            });
          }, debounceMs);
        });
      },
      freeInlineCompletions() { /* noop */ },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return () => {
      disposableRef.current?.dispose();
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [monaco, enabled, debounceMs, fetchCompletion]);
}
