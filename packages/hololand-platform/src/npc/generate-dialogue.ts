import { NPCPlayerMemory } from './player-memory.js';

export interface GenerateDialogueInput {
  npcId: string;
  playerId: string;
  prompt: string;
  memory: NPCPlayerMemory;
}

/**
 * Generate an NPC response that references persisted player facts.
 *
 * In production this would call an LLM with the recalled facts injected as
 * system context. The current implementation is deterministic so tests can
 * assert that facts survive reload and appear in dialogue.
 */
export function generateDialogue(input: GenerateDialogueInput): string {
  const facts = input.memory.recall(input.playerId);
  const context =
    facts.length > 0 ? `[Known facts about ${input.playerId}: ${facts.join('; ')}]` : '';
  return `${context} NPC ${input.npcId} responds to: ${input.prompt}`;
}
