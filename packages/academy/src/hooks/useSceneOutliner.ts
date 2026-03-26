'use client';

/**
 * useSceneOutliner — parses HoloScript code into a structured object/scene tree.
 * Provides selection state and a jump-to-line callback.
 */

import { useMemo } from 'react';
import { useSceneStore, useEditorStore } from '@/lib/stores';

export type OutlinerNodeType = 'scene' | 'object' | 'light' | 'camera' | 'group';

export interface OutlinerNode {
  id: string;
  name: string;
  type: OutlinerNodeType;
  line: number;
  depth: number;
  traits: string[];
  children: OutlinerNode[];
}

function detectType(line: string): OutlinerNodeType {
  if (/^scene\s+/.test(line)) return 'scene';
  if (/^light\s+/.test(line)) return 'light';
  if (/^camera\s+/.test(line)) return 'camera';
  if (/^group\s+/.test(line)) return 'group';
  return 'object';
}

function parseOutliner(code: string): OutlinerNode[] {
  const lines = code.split('\n');
  const roots: OutlinerNode[] = [];
  const stack: OutlinerNode[] = [];
  let currentNode: OutlinerNode | null = null;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const lineNum = i + 1;

    // Block open
    const blockMatch = line.match(/^(scene|object|light|camera|group)\s+"([^"]+)"\s*\{?$/);
    if (blockMatch) {
      const node: OutlinerNode = {
        id: `node-${lineNum}`,
        name: blockMatch[2],
        type: detectType(line),
        line: lineNum,
        depth: stack.length,
        traits: [],
        children: [],
      };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        roots.push(node);
      }
      stack.push(node);
      currentNode = node;
      return;
    }

    // Trait line
    const traitMatch = line.match(/^@(\w+)/);
    if (traitMatch && currentNode) {
      currentNode.traits.push(traitMatch[1]);
    }

    // Block close
    if (line === '}' && stack.length > 0) {
      stack.pop();
      currentNode = stack.length > 0 ? stack[stack.length - 1] : null;
    }
  });

  return roots;
}

export function useSceneOutliner() {
  const code = useSceneStore((s) => s.code) ?? '';
  const selectedId = useEditorStore((s) => s.selectedObjectId);

  const tree = useMemo(() => parseOutliner(code), [code]);

  const allNodes = useMemo(() => {
    const flat: OutlinerNode[] = [];
    const flatten = (nodes: OutlinerNode[]) => {
      for (const n of nodes) {
        flat.push(n);
        flatten(n.children);
      }
    };
    flatten(tree);
    return flat;
  }, [tree]);

  const selectedNode = useMemo(
    () => allNodes.find((n) => n.id === selectedId) ?? null,
    [allNodes, selectedId]
  );

  return { tree, allNodes, selectedNode };
}
