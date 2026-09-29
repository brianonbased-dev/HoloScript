'use client';

import { useMemo } from 'react';
import { HoloScriptPlusParser, HoloCompositionParser, SceneIRCompiler } from '@holoscript/core';
import type { PipelineResult, R3FNode } from '@/types';
import { parseSceneSource } from '@/lib/holoCompositionSource';

type ScenePipelineFormatHint = 'auto' | 'holo' | 'hsplus';

interface ScenePipelineOptions {
  formatHint?: ScenePipelineFormatHint;
}

/**
 * Post-process R3F tree to set assetMaturity on nodes with @draft trait.
 * Walks the tree recursively and marks draft nodes so the renderer
 * can auto-enter draft mode without manual toggle.
 */
function applyDraftMaturity(node: R3FNode): void {
  // Check if this node has the 'draft' trait
  if (node.traits?.has('draft') || node.props?.draftMode) {
    node.assetMaturity = 'draft';
  }
  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      applyDraftMaturity(child);
    }
  }
}

/**
 * Parses HoloScript source code and compiles it to a scene-IR tree for rendering.
 * Detects format (.holo composition vs .hsplus) automatically: see
 * parseSceneSource, which looks past leading comments and blank lines.
 */
export function useScenePipeline(code: string, options: ScenePipelineOptions = {}): PipelineResult {
  return useMemo(() => {
    if (!code.trim()) {
      return { r3fTree: null, errors: [] };
    }

    try {
      const compiler = new SceneIRCompiler();
      const reading = parseSceneSource(code, options.formatHint ?? 'auto', {
        composition: (text) => new HoloCompositionParser().parse(text),
        hsplus: (text) => new HoloScriptPlusParser().parse(text),
      });

      // .holo composition format
      if (reading.form === 'composition') {
        const result = reading.result;

        if (result.errors && result.errors.length > 0) {
          return {
            r3fTree: null,
            errors: result.errors.map((e: string | { message: string; line?: number }) => ({
              message: typeof e === 'string' ? e : e.message || String(e),
              line: typeof e === 'string' ? undefined : e.line,
            })),
          };
        }

        const tree = compiler.compileComposition(result.ast ?? result);
        if (tree) applyDraftMaturity(tree);
        return { r3fTree: tree, errors: [] };
      }

      // Default: .hsplus format
      const result = reading.result;

      if (result.errors && result.errors.length > 0) {
        return {
          r3fTree: null,
          errors: result.errors.map((e: string | { message?: string; line?: number }) => ({
            message: typeof e === 'string' ? e : e.message || String(e),
            line: typeof e === 'string' ? undefined : e.line,
          })),
        };
      }

      const tree = compiler.compile(result.ast ?? result);
      if (tree) applyDraftMaturity(tree);
      return { r3fTree: tree, errors: [] };
    } catch (err) {
      return {
        r3fTree: null,
        errors: [{ message: err instanceof Error ? err.message : String(err) }],
      };
    }
  }, [code, options.formatHint]);
}
