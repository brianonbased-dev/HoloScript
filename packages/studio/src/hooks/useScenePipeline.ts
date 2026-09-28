'use client';

import { useMemo } from 'react';
import type { PipelineResult } from '@/types';
import { runScenePipeline, type ScenePipelineFormatHint } from '@/lib/scenePipeline';

interface ScenePipelineOptions {
  formatHint?: ScenePipelineFormatHint;
}

/**
 * Parses HoloScript source code and compiles it to a scene-IR tree for rendering.
 * Detects format (.holo composition vs .hsplus) automatically. The pipeline
 * itself lives in @/lib/scenePipeline, where Brittney's self-check runs it too.
 */
export function useScenePipeline(code: string, options: ScenePipelineOptions = {}): PipelineResult {
  return useMemo(
    () => runScenePipeline(code, options.formatHint ?? 'auto'),
    [code, options.formatHint]
  );
}
