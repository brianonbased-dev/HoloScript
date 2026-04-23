/**
 * Narrative executors — extracted from HoloScriptRuntime (W1-T4 slice 15)
 *
 * Three small AST-node executors that share the narrative concern:
 *   - `executeNarrative` — registers quests, auto-starts at startNode
 *   - `executeQuest` — begins a quest, marks it active
 *   - `executeDialogue` — updates dialogue state with speaker + node id
 *
 * Each takes a `NarrativeContext` with the three narrative state
 * containers (`quests` Map, `activeQuestId` slot, `dialogueState`
 * record). All three are dispatch-only (called from `executeNode`
 * switch) so methods are deleted outright in HSR — no wrappers.
 *
 * **Pattern**: state-mutator context (pattern 4 variant). Callers
 * are type-free `(node, ctx)` — logger is the only side-effect.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 15 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2957-3007)
 */

import { logger } from '../logger';
import type {
  DialogueNode,
  ExecutionResult,
  NarrativeNode,
  QuestNode,
} from '../types';

/** Minimal narrative-state accessor threaded in from HSR. */
export interface NarrativeContext {
  /** Registry of all quests in the current narrative. */
  quests: Map<string, QuestNode>;
  /** Mutable slot for the currently-active quest id (non-null when a quest is running). */
  setActiveQuestId: (id: string | undefined) => void;
  /** Mutable slot for dialogue state (currentNodeId + speaker). */
  setDialogueState: (state: { currentNodeId: string; speaker: string }) => void;
}

/**
 * Execute a `narrative` AST node: register all child quests, log
 * auto-start if `startNode` is set. Returns a success envelope
 * with quest count.
 */
export async function executeNarrative(
  node: NarrativeNode,
  ctx: NarrativeContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  logger.info(`[Narrative] Initializing narrative: ${node.id}`);

  // Register all quests in the narrative
  for (const quest of node.quests) {
    ctx.quests.set(quest.id, quest);
  }

  // Auto-start the narrative if startNode is provided
  if (node.startNode) {
    logger.info(`[Narrative] Auto-starting at node: ${node.startNode}`);
  }

  return {
    success: true,
    output: `Narrative ${node.id} initialized with ${node.quests.length} quests`,
    executionTime: Date.now() - startTime,
  };
}

/**
 * Execute a `quest` AST node: mark the quest active + register it
 * in the quests Map (so downstream references can resolve it).
 */
export async function executeQuest(
  node: QuestNode,
  ctx: NarrativeContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  logger.info(`[Narrative] Starting quest: ${node.title}`, { questId: node.id });

  ctx.setActiveQuestId(node.id);
  ctx.quests.set(node.id, node);

  return {
    success: true,
    output: `Quest ${node.id} started`,
    executionTime: Date.now() - startTime,
  };
}

/**
 * Execute a `dialogue` AST node: update dialogue state with the
 * current node id + speaker. Text is logged for debug visibility.
 */
export async function executeDialogue(
  node: DialogueNode,
  ctx: NarrativeContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  logger.info(`[Narrative] Dialogue: ${node.speaker} says "${node.text}"`);

  ctx.setDialogueState({
    currentNodeId: node.id,
    speaker: node.speaker,
  });

  return {
    success: true,
    output: `Dialogue node ${node.id} executed`,
    executionTime: Date.now() - startTime,
  };
}
