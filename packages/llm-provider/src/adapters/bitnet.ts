/**
 * BitNet Adapter
 *
 * Connects to a local bitnet.cpp inference server.
 * BitNet runs 1-bit quantized models that use ~10x less memory than
 * standard GGUF models and run faster on CPU — no GPU required.
 *
 * Setup (one-time):
 *   git clone --recursive https://github.com/microsoft/BitNet
 *   cd BitNet
 *   pip install -r requirements.txt
 *   python setup_env.py -md microsoft/bitnet-b1.58-2B-4T -q i2_s
 *
 * Run the server:
 *   python run_inference.py --serve --port 8080 --host 0.0.0.0
 *
 * The server exposes: POST http://localhost:8080/v1/chat/completions
 *
 * Why BitNet over standard GGUF?
 *   - ~500 MB model size vs ~4 GB for Mistral-7B Q4
 *   - Faster on CPU (1-bit arithmetic, no FP multiply)
 *   - Deployable on Railway, Fly.io, any server without GPU
 *   - See: https://github.com/microsoft/BitNet
 *
 * @version 2.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type {
  LLMProviderConfig,
  LLMCompletionRequest,
  LLMCompletionResponse,
} from '../types';
import { LLMProviderError } from '../types';

type BitNetAdapterConfig = Omit<LLMProviderConfig, 'apiKey'> & {
  apiKey?: string;
  model?: string;
};

// =============================================================================
// Official BitNet models from microsoft/BitNet on HuggingFace
// Run: python setup_env.py -md <model_id> -q i2_s
// =============================================================================

export const BITNET_MODELS = [
  'microsoft/bitnet-b1.58-2B-4T',  // 2B params, trained on 4T tokens (recommended)
  '1bitLLM/bitnet_b1_58-large',    // Older reference model (~700M params)
] as const;

export type BitNetModel = (typeof BITNET_MODELS)[number];

/**
 * Short aliases accepted by bitnet.cpp (maps to full HuggingFace model IDs)
 */
export const BITNET_MODEL_ALIASES: Readonly<Record<string, BitNetModel>> = {
  'bitnet-b1.58-2B-4T': 'microsoft/bitnet-b1.58-2B-4T',
  'bitnet-2b': 'microsoft/bitnet-b1.58-2B-4T',
  'bitnet-large': '1bitLLM/bitnet_b1_58-large',
};

// =============================================================================
// HoloScript system prompt — compact for BitNet 2B-4T
// The 2B model works best with short prompts (< 200 tokens) to leave room for output.
// =============================================================================

const BITNET_HOLOSCRIPT_SYSTEM_PROMPT = `You are a HoloScript code generator. Output ONLY valid HoloScript code, no markdown.

Syntax:
  composition {
    cube { @color(red) @position(0,1,0) @grabbable @physics }
    sphere { @color(blue) @position(2,1,0) @emissive(cyan) }
    plane { @color(gray) @position(0,0,0) @scale(10,1,10) @static }
  }

Rules: Return code only. y >= 0. Use @static on floors.`;

// =============================================================================
// BitNet Adapter
// =============================================================================

export class BitNetAdapter extends BaseLLMAdapter {
  readonly name = 'bitnet' as const;
  readonly models = BITNET_MODELS;
  readonly defaultHoloScriptModel: string;

  private readonly localBaseURL: string;

  constructor(config: BitNetAdapterConfig = {}) {
    // BitNet 2B-4T is fast on CPU — 60s is ample even on slow machines
    super({ ...config, apiKey: config.apiKey ?? '', timeoutMs: config.timeoutMs ?? 60000 });

    this.localBaseURL = (config.baseURL ?? 'http://localhost:8080').replace(/\/$/, '');
    this.defaultHoloScriptModel = config.model ?? 'microsoft/bitnet-b1.58-2B-4T';
  }

  protected getDefaultModel(): string {
    return 'microsoft/bitnet-b1.58-2B-4T';
  }

  /**
   * Send a chat completion request to the bitnet.cpp server.
   * Uses the OpenAI-compatible /v1/chat/completions endpoint.
   */
  async complete(
    request: LLMCompletionRequest,
    model: string = this.defaultHoloScriptModel
  ): Promise<LLMCompletionResponse> {
    const url = `${this.localBaseURL}/v1/chat/completions`;

    const body = JSON.stringify({
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.maxTokens ?? 512,   // BitNet 2B has shorter optimal generation length
      temperature: request.temperature ?? 0.1, // Low temp for deterministic code output
      top_p: request.topP ?? 1,
      stop: request.stop,
      stream: false,
    });

    let raw: unknown;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new LLMProviderError(
          `BitNet server returned ${response.status}: ${text}`,
          'bitnet',
          response.status,
          response.status === 429
        );
      }

      raw = await response.json();
    } catch (err) {
      if (err instanceof LLMProviderError) throw err;

      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('aborted') || msg.includes('timeout');
      const hint = isTimeout
        ? `bitnet.cpp request timed out at ${this.localBaseURL}. Is the server running? python run_inference.py --serve --port 8080`
        : `Cannot reach bitnet.cpp server at ${this.localBaseURL}. Setup: https://github.com/microsoft/BitNet`;

      throw new LLMProviderError(hint, 'bitnet', undefined, false);
    }

    // Parse OpenAI-compatible response shape
    const data = raw as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      model?: string;
    };

    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';

    return {
      content,
      model: data.model ?? model,
      provider: 'bitnet',
      finishReason: (choice?.finish_reason as LLMCompletionResponse['finishReason']) ?? 'stop',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      raw,
    };
  }

  /**
   * Returns the HoloScript-tuned system prompt for BitNet's smaller model context.
   * Overrides the base class version to use the compact prompt.
   */
  protected getHoloScriptSystemPrompt(): string {
    return BITNET_HOLOSCRIPT_SYSTEM_PROMPT;
  }

  /**
   * Check if the local BitNet server is reachable.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.localBaseURL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      // Some llama.cpp builds use /v1/models instead of /health
      if (!response.ok) {
        const modelsResponse = await fetch(`${this.localBaseURL}/v1/models`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!modelsResponse.ok) throw new Error(`Status ${modelsResponse.status}`);
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: `bitnet.cpp server unreachable at ${this.localBaseURL}. Run: python run_inference.py --serve. Error: ${error}`,
      };
    }
  }
}
