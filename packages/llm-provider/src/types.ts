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

export interface LLMMessage {
  role: MessageRole;
  content: string;
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
}

export interface LLMCompletionResponse {
  /** The generated text content */
  content: string;

  /** Token usage statistics */
  usage: TokenUsage;

  /** Which model produced this response */
  model: string;

  /** The provider that handled this request */
  provider: LLMProviderName;

  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';

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

export type LLMProviderName = 'openai' | 'anthropic' | 'gemini' | 'mock';

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
  complete(
    request: LLMCompletionRequest,
    model?: string
  ): Promise<LLMCompletionResponse>;

  /**
   * Generate HoloScript code from a natural language description.
   * Includes automatic validation and retry logic.
   */
  generateHoloScript(
    request: HoloScriptGenerationRequest
  ): Promise<HoloScriptGenerationResponse>;

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
  constructor(provider: LLMProviderName, public readonly tokenCount: number) {
    super(
      `Context length exceeded for ${provider} (${tokenCount} tokens)`,
      provider,
      400,
      false
    );
    this.name = 'LLMContextLengthError';
  }
}
