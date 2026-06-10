/**
 * Fable-5 Ultracode reference config — REPLAY, not a live run.
 *
 * Founder directive (2026-06-10): "Fable 5 on Ultracode is the benchmark for
 * Brittney — orchestration, mindset of capabilities and opportunities,
 * physics, reality, game feel."
 *
 * This config replays curated reference transcripts authored by Claude
 * Fable 5 running under Ultracode (multi-agent orchestration) in the
 * 2026-06-10 founder session. They define the bar: the judge scores them
 * with the exact same rubric as every live config, so reports show the
 * gap between Brittney and the reference per dimension.
 *
 * HONESTY CONTRACT (paper-11 / claude-code-baseline lesson — that config is
 * an SDK simulation, not the product): this one never pretends to be live.
 * model_id is explicit about being a replay, usage/cost is zero, and a task
 * with no reference transcript returns an error instead of an empty pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ConfigRunner, ConfigRunResult, SceneMutation, Task } from '../types';

const MODEL_ID = 'claude-fable-5 [ultracode reference transcript replay]';

export interface Fable5ReferenceArtifact {
  task_id: string;
  authored_by: string;
  output_text: string;
  tool_rounds: number;
  scene_mutations: SceneMutation[];
}

export function makeFable5UltracodeReference(
  opts: { referenceDir?: string } = {}
): ConfigRunner {
  const dir = opts.referenceDir ?? path.join(__dirname, '..', 'reference', 'fable5');
  return {
    name: 'fable5-ultracode',
    run: async (task: Task): Promise<ConfigRunResult> => {
      const file = path.join(dir, `${task.id}.json`);
      const zeroUsage = { input_tokens: 0, output_tokens: 0 };
      if (!fs.existsSync(file)) {
        return {
          output_text: '',
          tool_rounds: 0,
          usage: zeroUsage,
          model_id: MODEL_ID,
          scene_mutations: [],
          error: `no Fable-5 reference transcript for task ${task.id} (reference covers the fable5-dimension tier)`,
        };
      }
      const art = JSON.parse(fs.readFileSync(file, 'utf8')) as Fable5ReferenceArtifact;
      return {
        output_text: art.output_text,
        tool_rounds: art.tool_rounds,
        usage: zeroUsage,
        model_id: MODEL_ID,
        scene_mutations: art.scene_mutations,
        create_object_count: art.scene_mutations.filter((m) => m.tool_name === 'create_object')
          .length,
      };
    },
  };
}
