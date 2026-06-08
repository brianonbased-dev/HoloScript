/**
 * Assemble the full per-arm prompt for the live run.
 *
 * The arms differ in REPRESENTATION (the C1 variable):
 *   Arm A — natural-language instruction phrasing (task.prompt.A).
 *   Arm B/C — compact HoloScript-IR instruction phrasing (task.prompt.B).
 * Arm C additionally receives retrieved offload context (HoloGraph/GOLD).
 *
 * HONEST SCOPE NOTE: in this first operationalization the representational
 * delta lives in the INSTRUCTION phrasing (NL vs IR) and the tool description,
 * while the scene block is shown as HoloScript in both arms. A fuller C1 test
 * also renders the SCENE itself in NL for Arm A. That refinement is part of the
 * expanded-suite slice; the verdict run should state which operationalization
 * produced it so the C1 number is not overclaimed.
 */

import { BRITTNEY_MUTATION_TOOL_NAMES } from '../../brittney/SimContractGate';
import type { Arm, BenchTask } from './types';

export const EXP1_SYSTEM_PROMPT = [
  'You are editing a HoloScript scene.',
  "Apply the user's instruction as a SINGLE scene mutation that RESPECTS the scene's",
  'declared SimulationContract — honor property bounds, keep required objects and',
  'required traits, and never add forbidden traits.',
  'Respond with ONLY a JSON object and no prose: {"tool":"<tool>","input":{...}}.',
  `Available tools: ${[...BRITTNEY_MUTATION_TOOL_NAMES].join(', ')}.`,
  'Property mutations use input {object_name, trait_name, property_key, property_value};',
  'trait mutations use input {object_name, trait_name}; compose uses {object_name, trait_names:[...]}.',
].join(' ');

export function assembleArmPrompt(task: BenchTask, arm: Arm, retrieval?: string): string {
  const instruction = arm === 'A' ? task.prompt.A : task.prompt.B;
  const sceneBlock = `Scene:\n${task.sceneContext}`;
  const offload = retrieval ? `\n\nRetrieved context (offload):\n${retrieval}` : '';
  return `${sceneBlock}\n\nInstruction: ${instruction}${offload}\n\nRespond with the JSON mutation only.`;
}
