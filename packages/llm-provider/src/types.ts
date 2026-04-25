/**
 * Unified LLM Provider Types
 *
 * Provider-agnostic interfaces for working with OpenAI, Anthropic (Claude),
 * and Google Gemini from HoloScript scenes and AI agents.
 *
 * @module @holoscript/llm-provider
 * @version 1.0.0
 */

// =============================================================================
// Core Message Types
// =============================================================================

export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Content for a user message that's feeding tool results back to the model.
 * Caller emits one `tool_result` block per `tool_use` block in the prior
 * assistant response. Anthropic adapter recognizes this shape and forwards.
 */
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  /** Optional: mark the tool result as an error so the model retries / reroutes. */
  is_error?: boolean;
}

export interface LLMMessage {
  role: MessageRole;
  /** Either plain text (most messages) OR a structured content array.
   *  - Assistant messages mid-tool-loop carry the assistant's prior
   *    text + tool_use blocks so the model has its own turn in context.
   *  - User messages mid-tool-loop carry tool_result blocks. */
  content: string | Array<TextBlock | ToolUseBlock | ToolResultBlock>;
}

export interface LLMSystemMessage {
  role: 'system';
  content: string;
}

export interface LLMUserMessage {
  role: 'user';
  content: string;
}

export interface LLMAssistantMessage {
  role: 'assistant';
  content: string;
}

// =============================================================================
// Request / Response Types
// =============================================================================

export interface LLMCompletionRequest {
  /** The messages to send to the model */
  messages: LLMMessage[];

  /** Maximum tokens in the response */
  maxTokens?: number;

  /** Temperature (0-2). Higher = more creative. Default: 0.7 */
  temperature?: number;

  /** Top-P nucleus sampling. Default: 1 */
  topP?: number;

  /** Stop sequences - model will stop generating before these tokens */
  stop?: string[];

  /** Whether to stream the response */
  stream?: boolean;

  /**
   * Tools the model can call. When set, the response may contain `toolUses`
   * blocks that the caller must execute and re-feed via a follow-up request
   * containing assistantBlocks (the prior response) + tool_result messages.
   * Anthropic adapter passes these straight through to messages.stream.
   */
  tools?: ToolSpec[];
}

/**
 * Spec for a tool the model is allowed to call. Schema follows the Anthropic
 * tool-use shape (which also matches OpenAI function-calling JSONSchema).
 */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** A tool call the model wants the caller to execute. */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** A text block from an assistant response (separate from tool_use blocks). */
export interface TextBlock {
  type: 'text';
  text: string;
}

export type AssistantContentBlock = TextBlock | ToolUseBlock;

/**
 * Coerce LLMMessage content to a plain string for adapters that don't
 * support tool-use (openai, gemini, local-llm, bitnet, mock). Non-text
 * blocks are flattened to a JSON-ish summary so the message still carries
 * SOME signal about what the model said. Adapters that DO support tool-use
 * (currently only anthropic) should pass content through unchanged.
 */
export function messageContentAsString(content: LLMMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => {
      if (block.type === 'text') return block.text;
      if (block.type === 'tool_use') {
        return `[tool_use ${block.name} id=${block.id} input=${JSON.stringify(block.input)}]`;
      }
      if (block.type === 'tool_result') {
        return `[tool_result for ${block.tool_use_id}${block.is_error ? ' (error)' : ''}]\n${block.content}`;
      }
      return '';
    })
    .join('\n');
}

export interface LLMCompletionResponse {
  /** The generated text content (concatenated text blocks only) */
  content: string;

  /** Token usage statistics */
  usage: TokenUsage;

  /** Which model produced this response */
  model: string;

  /** The provider that handled this request */
  provider: LLMProviderName;

  /** Finish reason — `tool_use` indicates toolUses must be executed and
   *  re-fed via a follow-up request to continue the loop. */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error' | 'tool_use';

  /**
   * Tool-use blocks the model wants the caller to execute. Empty when the
   * model didn't request tools. Caller should run each tool, then send a
   * follow-up request containing this assistant turn's full content blocks
   * (preserved in `assistantBlocks` for round-trip fidelity) plus a user
   * message with `tool_result` blocks for each tool use.
   */
  toolUses?: ToolUseBlock[];

  /** Full assistant content blocks (text + tool_use), in order, for the
   *  follow-up tool_result message construction. */
  assistantBlocks?: AssistantContentBlock[];

  /** Raw response from the provider (for debugging) */
  raw?: unknown;
}

export interface TokenUsage {
  /** Tokens in the prompt/input */
  promptTokens: number;

  /** Tokens in the completion/output */
  completionTokens: number;

  /** Total tokens used */
  totalTokens: number;
}

// =============================================================================
// HoloScript-Specific Generation Types
// =============================================================================

export interface HoloScriptGenerationRequest {
  /** Natural language description of the scene */
  prompt: string;

  /** Optional system context for the model */
  systemPrompt?: string;

  /** Maximum scene complexity (object count hint) */
  maxObjects?: number;

  /** Target export format */
  targetFormat?: 'holo' | 'hsplus' | 'hs';

  /** Temperature override */
  temperature?: number;
}

export interface HoloScriptGenerationResponse {
  /** The generated HoloScript code */
  code: string;

  /** Whether the generated code passed validation */
  valid: boolean;

  /** Validation errors if any */
  errors: string[];

  /** The provider that generated this */
  provider: LLMProviderName;

  /** Token usage */
  usage: TokenUsage;

  /** Detected traits in generated code */
  detectedTraits: string[];
}

// =============================================================================
// Provider Configuration
// =============================================================================

export type LLMProviderName = 'openai' | 'anthropic' | 'gemini' | 'mock' | 'bitnet' | 'local-llm';

export interface LLMProviderConfig {
  /** API key for authentication */
  apiKey: string;

  /** Base URL override (for proxies or self-hosted endpoints) */
  baseURL?: string;

  /** Request timeout in milliseconds. Default: 30000 */
  timeoutMs?: number;

  /** Maximum retry attempts on rate limits. Default: 3 */
  maxRetries?: number;

  /** Default model to use if not specified per-request */
  defaultModel?: string;
}

export interface OpenAIProviderConfig extends LLMProviderConfig {
  /** OpenAI organization ID */
  organization?: string;
}

export interface AnthropicProviderConfig extends LLMProviderConfig {
  /** Anthropic API version header. Default: '2023-06-01' */
  apiVersion?: string;
}

export interface GeminiProviderConfig extends LLMProviderConfig {
  /** Google Cloud project ID (for Vertex AI) */
  projectId?: string;

  /** Google Cloud location (for Vertex AI). Default: 'us-central1' */
  location?: string;
}

/**
 * Config for the real bitnet.cpp inference server.
 * No API key required — the server runs locally.
 */
export interface BitNetProviderConfig extends Omit<LLMProviderConfig, 'apiKey'> {
  /** API key — unused for local servers, defaults to empty string */
  apiKey?: string;

  /**
   * Base URL of the bitnet.cpp server.
   * Default: http://localhost:8080
   */
  baseURL?: string;

  /** BitNet model ID (HuggingFace format). Default: 'microsoft/bitnet-b1.58-2B-4T' */
  model?: string;
}

/**
 * Config for a generic local OpenAI-compatible inference server.
 * Works with llama.cpp, Ollama, LM Studio, or any compatible server.
 * No API key required — the server runs locally.
 */
export interface LocalLLMProviderConfig extends Omit<LLMProviderConfig, 'apiKey'> {
  /** API key — unused for local servers, defaults to empty string */
  apiKey?: string;

  /**
   * Base URL of the local LLM server.
   * Default: http://localhost:8080
   */
  baseURL?: string;

  /** Model name to send in requests. Default: 'mistral-7b-instruct' */
  model?: string;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Unified interface that all LLM provider adapters must implement.
 */
export interface ILLMProvider {
  /** The name of this provider */
  readonly name: LLMProviderName;

  /** Available models for this provider */
  readonly models: readonly string[];

  /** Default model for HoloScript generation */
  readonly defaultHoloScriptModel: string;

  /**
   * Send a completion request to the provider.
   */
  complete(request: LLMCompletionRequest, model?: string): Promise<LLMCompletionResponse>;

  /**
   * Generate HoloScript code from a natural language description.
   * Includes automatic validation and retry logic.
   */
  generateHoloScript(request: HoloScriptGenerationRequest): Promise<HoloScriptGenerationResponse>;

  /**
   * Check if the provider is correctly configured and reachable.
   */
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

// =============================================================================
// Provider Registry Types
// =============================================================================

export interface LLMProviderRegistry {
  openai?: ILLMProvider;
  anthropic?: ILLMProvider;
  gemini?: ILLMProvider;
  bitnet?: ILLMProvider;
  'local-llm'?: ILLMProvider;
}

export interface ProviderSelectionStrategy {
  /** Primary provider to use */
  primary: LLMProviderName;

  /** Fallback provider if primary fails */
  fallback?: LLMProviderName;

  /** Cost optimization: prefer cheapest available provider */
  optimizeForCost?: boolean;

  /** Speed optimization: prefer fastest responding provider */
  optimizeForSpeed?: boolean;
}

// =============================================================================
// Error Types
// =============================================================================

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: LLMProviderName,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMProviderError';
  }
}

export class LLMRateLimitError extends LLMProviderError {
  constructor(
    provider: LLMProviderName,
    public readonly retryAfterMs?: number
  ) {
    super(`Rate limit exceeded for ${provider}`, provider, 429, true);
    this.name = 'LLMRateLimitError';
  }
}

export class LLMAuthenticationError extends LLMProviderError {
  constructor(provider: LLMProviderName) {
    super(`Authentication failed for ${provider} - check your API key`, provider, 401, false);
    this.name = 'LLMAuthenticationError';
  }
}

export class LLMContextLengthError extends LLMProviderError {
  constructor(
    provider: LLMProviderName,
    public readonly tokenCount: number
  ) {
    super(`Context length exceeded for ${provider} (${tokenCount} tokens)`, provider, 400, false);
    this.name = 'LLMContextLengthError';
  }
}
