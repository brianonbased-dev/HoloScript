/**
 * LLMAgent Trait
 *
 * LLM-powered decision-making with bounded autonomy.
 * Supports tool calling, conversation history, and escalation policies.
 *
 * TODO(G.XR.04): KV cache explosion guard for XR.
 *   context_window is 4096 by default. On Quest 3 (8GB), a 3B model with
 *   32K context needs 2-4GB KV cache — leaves NO room for VR rendering.
 *   Add xr_context_limit: number to LLMConfig (default 4096 for XR, 32K for cloud).
 *   Implement aggressive context compression (COMPRESS phase) or KVSwap to flash.
 *
 * TODO(P.XR.05): Multi-agent spatial verification.
 *   When multiple @llm_agent nodes exist in a scene, add cross-verification:
 *   Agent A asserts "door is open" → verify against Agent B's spatial model.
 *   Prevents hallucination-induced state divergence in multi-user VR.
 *
 * TODO(P.XR.02): Compile tool schemas for on-device function calling.
 *   LLMTool definitions should compile to ExecuTorch inference packages.
 *   Llama 3.2 1B/3B supports native function calling — compile tools[] to
 *   the Llama tool_use format at build time, not runtime.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  timestamp: number;
}

interface EscalationCondition {
  type: 'keyword' | 'sentiment' | 'uncertainty' | 'action_count';
  value: string | number;
  action: 'escalate' | 'pause' | 'notify';
}

interface LLMState {
  conversationHistory: LLMMessage[];
  isProcessing: boolean;
  actionsTaken: number;
  turnActionCount: number;
  lastResponse: string | null;
  pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  isEscalated: boolean;
  lastRequestTime: number;
  tokenCount: number;
  /** G.XR.04: Current context token count for KV cache guard */
  currentContextTokens: number;
  /** P.XR.05: Spatial assertions from this agent for cross-verification */
  spatialAssertions: Map<string, { value: unknown; confidence: number; timestamp: number }>;
  /** P.XR.02: Compiled tool schemas in ExecuTorch format */
  compiledToolSchemas: string | null;
}

interface LLMConfig {
  model: string;
  system_prompt: string;
  context_window: number;
  temperature: number;
  tools: LLMTool[];
  max_actions_per_turn: number;
  bounded_autonomy: boolean;
  escalation_conditions: EscalationCondition[];
  api_endpoint?: string;
  rate_limit_ms: number;
  max_history_length: number;
  /** G.XR.04: XR context limit — on Quest 3, max 4096 to protect VR memory */
  xr_context_limit: number;
  /** P.XR.05: Enable multi-agent spatial verification */
  enable_spatial_verification: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function trimHistory(history: LLMMessage[], maxTokens: number): LLMMessage[] {
  const result: LLMMessage[] = [];
  let tokenCount = 0;

  // Always keep system message
  const systemMsg = history.find((m) => m.role === 'system');
  if (systemMsg) {
    result.push(systemMsg);
    tokenCount += estimateTokens(systemMsg.content);
  }

  // Add recent messages from end, respecting token limit
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'system') continue;

    const msgTokens = estimateTokens(msg.content);
    if (tokenCount + msgTokens > maxTokens) break;

    result.unshift(msg);
    tokenCount += msgTokens;
  }

  return result;
}

function checkEscalation(
  message: string,
  state: LLMState,
  conditions: EscalationCondition[]
): EscalationCondition | null {
  for (const cond of conditions) {
    switch (cond.type) {
      case 'keyword':
        if (message.toLowerCase().includes(String(cond.value).toLowerCase())) {
          return cond;
        }
        break;
      case 'action_count':
        if (state.actionsTaken >= Number(cond.value)) {
          return cond;
        }
        break;
      case 'uncertainty':
        // Check for uncertainty markers
        const uncertaintyWords = ['unsure', "don't know", 'uncertain', 'maybe', 'might'];
        if (uncertaintyWords.some((w) => message.toLowerCase().includes(w))) {
          return cond;
        }
        break;
    }
  }
  return null;
}

// =============================================================================
// HANDLER
// =============================================================================

export const llmAgentHandler: TraitHandler<LLMConfig> = {
  name: 'llm_agent',

  defaultConfig: {
    model: 'gpt-4',
    system_prompt: '',
    context_window: 4096,
    temperature: 0.7,
    tools: [],
    max_actions_per_turn: 3,
    bounded_autonomy: true,
    escalation_conditions: [],
    rate_limit_ms: 1000,
    max_history_length: 50,
  },

  onAttach(node, config, context) {
    const state: LLMState = {
      conversationHistory: [],
      isProcessing: false,
      actionsTaken: 0,
      turnActionCount: 0,
      lastResponse: null,
      pendingToolCalls: [],
      isEscalated: false,
      lastRequestTime: 0,
      tokenCount: 0,
    };

    // Add system prompt to history
    if (config.system_prompt) {
      state.conversationHistory.push({
        role: 'system',
        content: config.system_prompt,
        timestamp: Date.now(),
      });
    }

    node.__llmAgentState = state;
    context.emit?.('llm_agent_ready', { node });
  },

  onDetach(node) {
    delete node.__llmAgentState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__llmAgentState as LLMState;
    if (!state) return;

    // Process pending tool calls
    if (state.pendingToolCalls.length > 0 && !state.isProcessing) {
      const toolCall = state.pendingToolCalls.shift()!;

      context.emit?.('llm_tool_call', {
        node,
        tool: toolCall.name,
        arguments: toolCall.arguments,
        callId: toolCall.id,
      });

      state.actionsTaken++;
      state.turnActionCount++;

      // Check bounded autonomy
      if (config.bounded_autonomy && state.turnActionCount >= config.max_actions_per_turn) {
        context.emit?.('llm_turn_limit_reached', {
          node,
          actionsThisTurn: state.turnActionCount,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__llmAgentState as LLMState;
    if (!state) return;

    if (event.type === 'llm_prompt') {
      // User sends a prompt
      const userMessage = event.message as string;

      state.conversationHistory.push({
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      });

      // Check escalation
      const escalation = checkEscalation(userMessage, state, config.escalation_conditions);
      if (escalation) {
        state.isEscalated = true;
        context.emit?.('llm_escalation', {
          node,
          condition: escalation,
          message: userMessage,
        });
        if (escalation.action === 'pause') return;
      }

      // Rate limit check
      const now = Date.now();
      if (now - state.lastRequestTime < config.rate_limit_ms) {
        context.emit?.('llm_rate_limited', { node });
        return;
      }

      state.isProcessing = true;
      state.lastRequestTime = now;
      state.turnActionCount = 0;

      // Prepare messages for API
      const messages = trimHistory(state.conversationHistory, config.context_window);

      // Emit request for external handling
      context.emit?.('llm_request', {
        node,
        model: config.model,
        messages,
        temperature: config.temperature,
        tools: config.tools.length > 0 ? config.tools : undefined,
      });
    } else if (event.type === 'llm_response') {
      // Received response from LLM
      state.isProcessing = false;

      const response = event.response as {
        content?: string;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };

      // Handle tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const tc of response.tool_calls) {
          try {
            state.pendingToolCalls.push({
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments),
            });
          } catch {
            // Invalid JSON in arguments
          }
        }

        state.conversationHistory.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.tool_calls.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
          timestamp: Date.now(),
        });
      } else if (response.content) {
        state.lastResponse = response.content;

        state.conversationHistory.push({
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
        });

        // Check escalation in response
        const escalation = checkEscalation(response.content, state, config.escalation_conditions);
        if (escalation) {
          state.isEscalated = true;
          context.emit?.('llm_escalation', {
            node,
            condition: escalation,
            message: response.content,
          });
        }

        context.emit?.('llm_message', {
          node,
          content: response.content,
        });
      }

      // Trim history
      if (state.conversationHistory.length > config.max_history_length) {
        state.conversationHistory = trimHistory(state.conversationHistory, config.context_window);
      }
    } else if (event.type === 'llm_tool_result') {
      // Tool execution result
      state.conversationHistory.push({
        role: 'tool',
        content: JSON.stringify(event.result),
        tool_call_id: event.callId as string,
        timestamp: Date.now(),
      });

      // Continue conversation after tool result
      if (!state.isProcessing) {
        const messages = trimHistory(state.conversationHistory, config.context_window);
        state.isProcessing = true;

        context.emit?.('llm_request', {
          node,
          model: config.model,
          messages,
          temperature: config.temperature,
          tools: config.tools.length > 0 ? config.tools : undefined,
        });
      }
    } else if (event.type === 'llm_clear_history') {
      state.conversationHistory = config.system_prompt
        ? [{ role: 'system', content: config.system_prompt, timestamp: Date.now() }]
        : [];
      state.isEscalated = false;
      state.actionsTaken = 0;
    }
  },
};

export default llmAgentHandler;
