/**
 * @LocalInference — generic local LLM inference trait
 *
 * Marks a HoloScript composition as running inference locally via any
 * Ollama-compatible server (Jetson, Raspberry Pi, The Unit, laptop).
 * No cloud token cost. Enables EdgeCompiler's inference loop.
 *
 * Usage:
 *   traits ["local_inference"]   // in .hsplus compositions
 *   @LocalInference              // in .holo/.hs objects
 */

export interface LocalInferenceConfig {
  /** Ollama base URL on the target device (default: http://localhost:11434) */
  ollamaUrl?: string;
  /** Model name to use (default: qwen3:4b) */
  model?: string;
  /** Max context length in tokens (default: 8192) */
  contextLength?: number;
  /** Whether to send tool definitions (default: true) */
  toolCalling?: boolean;
  /** Request timeout in seconds (default: 120) */
  timeoutS?: number;
  /** Whether to use Ollama native /api/chat endpoint vs /v1/chat/completions */
  nativeOllamaApi?: boolean;
}

export interface LocalInferenceState {
  provider: 'local-llm';
  ollamaUrl: string;
  model: string;
  totalTokensGenerated: number;
  totalRequests: number;
  lastInferenceMs: number | null;
  costUSD: 0; // always 0 — local inference
}

export const LOCAL_INFERENCE_DEFAULTS: Required<LocalInferenceConfig> = {
  ollamaUrl: 'http://localhost:11434',
  model: 'qwen3:4b',
  contextLength: 8192,
  toolCalling: true,
  timeoutS: 120,
  nativeOllamaApi: true, // Ollama native API correctly parses tool_calls (3311a4d4c)
};

/**
 * Validate and normalise a LocalInference config from trait params.
 */
export function resolveLocalInferenceConfig(
  params?: Partial<LocalInferenceConfig>
): Required<LocalInferenceConfig> {
  return { ...LOCAL_INFERENCE_DEFAULTS, ...params };
}

/**
 * Supported models verified to work on Jetson Orin Nano Super 8GB (W.733):
 *   qwen3:4b     — 2.5 GB, tool-calling verified, ~15 tok/s, DEFAULT
 *   Fara-7B Q4   — 6 GB, computer-use, headless-only, ~6 tok/s
 */
export const JETSON_TESTED_MODELS = [
  'qwen3:4b',
  'hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M',
] as const;

export type JetsonTestedModel = (typeof JETSON_TESTED_MODELS)[number];

export function isJetsonTestedModel(model: string): model is JetsonTestedModel {
  return (JETSON_TESTED_MODELS as readonly string[]).includes(model);
}

/**
 * Build the Ollama /api/chat payload for a local inference call.
 */
export function buildOllamaChatPayload(
  messages: Array<{ role: string; content: string }>,
  config: Required<LocalInferenceConfig>,
  tools?: unknown[]
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
    options: { num_ctx: config.contextLength },
  };
  if (tools && tools.length > 0 && config.toolCalling) {
    payload.tools = tools;
  }
  return payload;
}
