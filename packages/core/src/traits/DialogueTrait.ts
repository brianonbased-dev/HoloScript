/**
 * Dialogue Trait
 *
 * Branching dialogue system with conversation trees, conditions, and LLM fallback.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface DialogueOption {
  text: string;
  nextNode?: string;
  condition?: string; // Blackboard key or expression
  action?: string; // Action to execute on selection
  emotion?: string; // Emotional tone
}

interface DialogueNode {
  id: string;
  speaker?: string;
  text: string;
  emotion?: string;
  options?: DialogueOption[];
  nextNode?: string; // Auto-advance if no options
  delay?: number; // Auto-advance delay in seconds
  onEnter?: string; // Action to run when entering node
  onExit?: string; // Action to run when leaving node
}

interface ConversationEntry {
  speaker: string;
  text: string;
  emotion?: string;
  timestamp: number;
  isPlayer: boolean;
}

interface DialogueState {
  isActive: boolean;
  currentNodeId: string | null;
  history: ConversationEntry[];
  blackboard: Record<string, unknown>;
  autoAdvanceTimer: number;
  awaitingInput: boolean;
  ongoingLLMRequest: boolean;
}

interface DialogueConfig {
  dialogue_tree: Record<string, DialogueNode>;
  start_node: string;
  llm_dynamic: boolean;
  llm_endpoint?: string;
  personality: string;
  knowledge_base: string;
  voice_enabled: boolean;
  voice_id: string;
  emotion_aware: boolean;
  speaker_name: string;
  player_name: string;
  history_limit: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function evaluateCondition(condition: string, blackboard: Record<string, unknown>): boolean {
  if (!condition) return true;

  // Simple key check
  if (blackboard[condition] !== undefined) {
    return !!blackboard[condition];
  }

  // Inverted key
  if (condition.startsWith('!')) {
    return !blackboard[condition.substring(1)];
  }

  // Comparison: key > value
  const gtMatch = condition.match(/^([\w]+)\s*>\s*(.+)$/);
  if (gtMatch) {
    const val = blackboard[gtMatch[1]];
    return typeof val === 'number' && val > parseFloat(gtMatch[2]);
  }

  // Comparison: key < value
  const ltMatch = condition.match(/^([\w]+)\s*<\s*(.+)$/);
  if (ltMatch) {
    const val = blackboard[ltMatch[1]];
    return typeof val === 'number' && val < parseFloat(ltMatch[2]);
  }

  // Equality: key == value
  const eqMatch = condition.match(/^([\w]+)\s*==\s*(.+)$/);
  if (eqMatch) {
    return blackboard[eqMatch[1]] === eqMatch[2];
  }

  return true;
}

function filterOptions(
  options: DialogueOption[],
  blackboard: Record<string, unknown>
): DialogueOption[] {
  return options.filter((opt) => !opt.condition || evaluateCondition(opt.condition, blackboard));
}

// =============================================================================
// HANDLER
// =============================================================================

export const dialogueHandler: TraitHandler<DialogueConfig> = {
  name: 'dialogue',

  defaultConfig: {
    dialogue_tree: {},
    start_node: 'start',
    llm_dynamic: false,
    personality: '',
    knowledge_base: '',
    voice_enabled: false,
    voice_id: '',
    emotion_aware: true,
    speaker_name: 'NPC',
    player_name: 'Player',
    history_limit: 100,
  },

  onAttach(node, _config, _context) {
    const state: DialogueState = {
      isActive: false,
      currentNodeId: null,
      history: [],
      blackboard: {},
      autoAdvanceTimer: 0,
      awaitingInput: false,
      ongoingLLMRequest: false,
    };
    (node as any).__dialogueState = state;
  },

  onDetach(node) {
    delete (node as any).__dialogueState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__dialogueState as DialogueState;
    if (!state || !state.isActive) return;

    const currentNode = state.currentNodeId ? config.dialogue_tree[state.currentNodeId] : null;
    if (!currentNode) return;

    // Auto-advance timer
    if (currentNode.delay && !state.awaitingInput) {
      state.autoAdvanceTimer += delta;
      if (state.autoAdvanceTimer >= currentNode.delay) {
        state.autoAdvanceTimer = 0;
        if (currentNode.nextNode) {
          advanceToNode(state, currentNode.nextNode, config, context, node);
        } else {
          endDialogue(state, context, node);
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__dialogueState as DialogueState;
    if (!state) return;

    if (event.type === 'start_dialogue') {
      state.isActive = true;
      state.currentNodeId = (event.startNode as string) || config.start_node;
      state.history = [];
      state.blackboard = { ...((event.context as Record<string, unknown>) || {}) };

      context.emit?.('dialogue_started', { node });
      enterNode(state, config, context, node);
    } else if (event.type === 'select_option') {
      if (!state.awaitingInput) return;

      const optionIndex = event.index as number;
      const currentNode = state.currentNodeId ? config.dialogue_tree[state.currentNodeId] : null;
      if (!currentNode?.options) return;

      const validOptions = filterOptions(currentNode.options, state.blackboard);
      const option = validOptions[optionIndex];
      if (!option) return;

      // Record player choice
      state.history.push({
        speaker: config.player_name,
        text: option.text,
        timestamp: Date.now(),
        isPlayer: true,
      });

      // Execute option action
      if (option.action) {
        context.emit?.('dialogue_action', { node, action: option.action });
      }

      state.awaitingInput = false;

      // Advance to next node
      if (option.nextNode) {
        advanceToNode(state, option.nextNode, config, context, node);
      } else {
        endDialogue(state, context, node);
      }
    } else if (event.type === 'inject_text') {
      // LLM or dynamic text injection
      state.history.push({
        speaker: (event.speaker as string) || config.speaker_name,
        text: event.text as string,
        emotion: event.emotion as string,
        timestamp: Date.now(),
        isPlayer: false,
      });
      context.emit?.('dialogue_line', {
        node,
        speaker: event.speaker || config.speaker_name,
        text: event.text,
        emotion: event.emotion,
      });
    } else if (event.type === 'set_dialogue_var') {
      state.blackboard[event.key as string] = event.value;
    } else if (event.type === 'end_dialogue') {
      endDialogue(state, context, node);
    }
  },
};

function enterNode(
  state: DialogueState,
  config: DialogueConfig,
  context: any,
  node: unknown
): void {
  const dialogueNode = state.currentNodeId ? config.dialogue_tree[state.currentNodeId] : null;
  if (!dialogueNode) {
    endDialogue(state, context, node);
    return;
  }

  // onEnter action
  if (dialogueNode.onEnter) {
    context.emit?.('dialogue_action', { node, action: dialogueNode.onEnter });
  }

  // Record NPC line
  state.history.push({
    speaker: dialogueNode.speaker || config.speaker_name,
    text: dialogueNode.text,
    emotion: dialogueNode.emotion,
    timestamp: Date.now(),
    isPlayer: false,
  });

  // Trim history
  while (state.history.length > config.history_limit) {
    state.history.shift();
  }

  // Emit dialogue line for UI
  context.emit?.('dialogue_line', {
    node,
    speaker: dialogueNode.speaker || config.speaker_name,
    text: dialogueNode.text,
    emotion: dialogueNode.emotion,
  });

  // Voice synthesis
  if (config.voice_enabled && config.voice_id) {
    context.emit?.('speak', {
      text: dialogueNode.text,
      voice_id: config.voice_id,
      emotion: dialogueNode.emotion,
    });
  }

  // Emit options if available
  if (dialogueNode.options && dialogueNode.options.length > 0) {
    const validOptions = filterOptions(dialogueNode.options, state.blackboard);
    state.awaitingInput = true;
    context.emit?.('dialogue_options', {
      node,
      options: validOptions.map((o, i) => ({ index: i, text: o.text })),
    });
  }
}

function advanceToNode(
  state: DialogueState,
  nodeId: string,
  config: DialogueConfig,
  context: any,
  node: unknown
): void {
  const currentNode = state.currentNodeId ? config.dialogue_tree[state.currentNodeId] : null;

  // onExit action
  if (currentNode?.onExit) {
    context.emit?.('dialogue_action', { node, action: currentNode.onExit });
  }

  state.currentNodeId = nodeId;
  state.autoAdvanceTimer = 0;
  enterNode(state, config, context, node);
}

function endDialogue(state: DialogueState, context: any, node: unknown): void {
  state.isActive = false;
  state.currentNodeId = null;
  state.awaitingInput = false;
  context.emit?.('dialogue_ended', { node, history: state.history });
}

export default dialogueHandler;
