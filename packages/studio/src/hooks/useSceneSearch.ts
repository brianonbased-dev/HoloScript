'use client';

/**
 * useSceneSearch — parses HoloScript code into a searchable object list.
 * Fuzzy-filters by name, type, and trait keywords.
 */

import { useMemo, useState, useCallback } from 'react';
import { useSceneStore } from '@/lib/stores';

export interface SceneSearchResult {
  name: string;
  type: 'object' | 'light' | 'scene';
  traits: string[];
  line: number; // 1-indexed line in source where this item begins
  snippet: string; // first 60 chars of the block
}

function parseSceneObjects(code: string): SceneSearchResult[] {
  const results: SceneSearchResult[] = [];
  const lines = code.split('\n');

  lines.forEach((line, idx) => {
    const sceneM = line.match(/^scene\s+"([^"]+)"/);
    if (sceneM) {
      results.push({
        name: sceneM[1]!,
        type: 'scene',
        traits: [],
        line: idx + 1,
        snippet: line.trim().slice(0, 60),
      });
    }

    const objM = line.match(/^object\s+"([^"]+)"/);
    if (objM) {
      // Collect traits from subsequent lines until closing brace
      const traits: string[] = [];
      let j = idx + 1;
      while (j < lines.length && !lines[j]!.trim().startsWith('}')) {
        const tm = lines[j]!.match(/@(\w+)/);
        if (tm) traits.push(tm[1]!);
        j++;
      }
      const isLight = traits.some((t) =>
        ['pointLight', 'directionalLight', 'spotLight'].includes(t)
      );
      results.push({
        name: objM[1]!,
        type: isLight ? 'light' : 'object',
        traits,
        line: idx + 1,
        snippet: line.trim().slice(0, 60),
      });
    }
  });

  return results;
}

function fuzzyMatch(result: SceneSearchResult, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    result.name.toLowerCase().includes(lower) ||
    result.traits.some((t) => t.toLowerCase().includes(lower)) ||
    result.type.includes(lower)
  );
}

export function useSceneSearch() {
  const code = useSceneStore((s) => s.code) ?? '';
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const allObjects = useMemo(() => parseSceneObjects(code), [code]);

  const results = useMemo(
    () => allObjects.filter((o) => fuzzyMatch(o, query)),
    [allObjects, query]
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  return { query, setQuery, results, isOpen, open, close, totalObjects: allObjects.length };
}
