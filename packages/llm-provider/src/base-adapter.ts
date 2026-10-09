/**
 * Base LLM Adapter
 *
 * Abstract base class providing shared functionality for all LLM provider adapters.
 * Implements retry logic, HoloScript generation prompting, and response validation.
 *
 * @version 1.0.0
 */

import type {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMRequestOptions,
  LLMStreamChunk,
  LLMFileMetadata,
  LLMFileUploadRequest,
  HoloScriptGenerationRequest,
  HoloScriptGenerationResponse,
  LLMProviderName,
  LLMProviderConfig,
  TokenUsage,
  Capabilities,
} from './types';
import type { RealtimeSessionConfig, RealtimeSession } from './realtime';
import { DEFAULT_CAPABILITIES } from './types';
import {
  LLMProviderError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMContextLengthError,
} from './types';

// =============================================================================
// HoloScript Generation System Prompt
// =============================================================================

/**
 * One whole, real HoloScript program, shown to every model that writes HoloScript
 * through `generateHoloScript` (and so through the MCP generate_object /
 * generate_scene tools).
 *
 * A verbatim copy of examples/quickstart/2-red-cube-teal-button.holo: a real file,
 * chosen because it is short and has the whole shape (one composition root around
 * an environment, a light and three objects), not written to suit any benchmark.
 *
 * Why a whole program instead of a description: shown exactly this program, eight
 * frontier models wrote the right answer (every requested detail) in 286 of 336 attempts
 * at the 14 author_holo tasks, against 181 of 336 without it; counting the right shape
 * only, 317 against 227. Qwen3-4B went from 0 to 12 of 14 on shape, 6 of 14 on right
 * answers (2026-10-08; ai-ecosystem receipts/holotune-native-authoring/
 * 2026-10-08-frontier-authoring-detail-regrade.json). An earlier example that showed
 * objects WITHOUT the composition wrapper scores 0 of 14 under the current grader: the
 * wrapper is the part that teaches.
 *
 * packages/mcp-server/src/__tests__/generator-prompt-parse.test.ts parses this
 * program, and every other program in the prompt, with parseHolo and the strict
 * layer, and checks this copy still matches the real file. Edit them together.
 */
export const HOLOSCRIPT_EXAMPLE_PROGRAM = `// 2-red-cube-teal-button.holo
// A throwable red cube and a teal cylinder button

composition "Red Cube and Teal Button" {
  // -- Visual: soft gradient sky with ground reflection --
  environment { skybox: "gradient", ambient_light: 0.35, shadows: true }
  light "Sun" { type: "directional", position: [5, 8, 3], intensity: 1.0, color: "#fff5e6", castShadow: true }

  object "Ground" {
    @collidable
    geometry: "plane"
    position: [0, 0, 0]
    scale: [10, 1, 10]
    material: { baseColor: "#2d3436", roughness: 0.85, metallic: 0.05 }
  }

  object "RedCube" {
    @grabbable
    @throwable
    @physics
    @collidable

    geometry: "cube"
    position: [0, 1, -2]
    scale: 0.3
    material: { baseColor: "#ff6b6b", roughness: 0.45, metallic: 0.15 }
  }

  object "TealButton" {
    @pointable
    @clickable

    geometry: "cylinder"
    position: [1.5, 1, -2]
    scale: [0.2, 0.05, 0.2]
    material: { baseColor: "#4ecdc4", roughness: 0.3, metallic: 0.3, emissive: "#2a9d8f", emissiveIntensity: 0.3 }
  }

  post_processing {
    bloom { intensity: 0.3, threshold: 0.9 }
    tone_mapping { mode: "aces" }
  }
}`;

/**
 * The system prompt `generateHoloScript` sends unless the request supplies its own.
 *
 * Every block in it that starts a line with `composition "` is a whole program,
 * and every trait it names is one core declares; the parse test named above enforces
 * both, so an edit here cannot quietly teach broken syntax.
 *
 * The "Workshop" and "Crossing" programs show forms that models shown only the example
 * kept missing when every requested detail was graded (2026-10-08 detail regrade, ai-ecosystem
 * receipts/holotune-native-authoring/). A form is shown only when it is the language's
 * documented spelling AND the parser keeps what it says; their names and values are not
 * the benchmark's. Checked 2026-10-08 at c76223725, and deliberately NOT shown:
 * - group `origin:`: the guide (docs/guides/compositions.md) and the r3f compiler use
 *   `position:`; no web compiler reads origin.
 * - a `trigger "x" { on:, emit: }` block and `@on_event(...)`: no doc defines the block (it
 *   parses only as an unknown named block, read by no compiler), and core declares no
 *   on_event trait.
 * - a state's `on: { event: "next" }`: it parses with no error and keeps no transition; the
 *   documented `transitions:` list is kept (one field per line; the comma form fails).
 * - a template's `behavior "x" { ... }`: the parser keeps its name and drops its fields.
 * Board: task_1791522939238_jbhj (benchmark spellings), _9e2p (web compilers emit no state
 * machine and drop group children on threejs), _4z0m (.hsplus reads no state transitions,
 * hence the ".holo only" label on Crossing).
 *
 * What the numbers do and do not show. With this whole prompt, right answers on the 14
 * author_holo tasks: Gemini 3.1 Pro 36 of 42 (33 with the prompt before Workshop and
 * Crossing), Qwen3-4B 10 of 14 before and after (ai-ecosystem receipts/
 * holotune-native-authoring/2026-10-08-generator-prompt-vocabulary-score.json). That gain
 * is in-sample: Workshop mirrors tasks hc-02/05/07/13, Crossing mirrors hc-14, and rule 7
 * names constructs chosen from this benchmark's misses. The names and values differ, but
 * the whole rise is one construct on one model (Gemini's hc-05, 0 to 3 of 3), so it does
 * not show that the prompt helps on tasks it was not tuned on.
 *
 * Known limits, not hidden: the featured example's inline `material: { ... }` keeps
 * nothing on the r3f target, and a state_machine renders on no web target (_9e2p); the
 * example is a verbatim real file, so it stays as written. The prompt is about 6.8 KB:
 * 2.4 times the 2.8 KB one it replaced, 4.6 KB of it before Workshop and Crossing. Every
 * request pays for that.
 */
export const HOLOSCRIPT_SYSTEM_PROMPT = `You are an expert HoloScript developer. HoloScript is a general-purpose semantic systems programming language under active construction. This generation task uses its declarative composition surface for spatial scenes; spatial computing is a proving ground, not the language boundary.

Every answer is ONE whole program with exactly one root block, and nothing outside it. This
program is valid HoloScript whether it is saved as .holo or .hsplus:

composition "Name" {
  environment { skybox: "gradient" }
  object "Name" { geometry: "cube" }
}

The outermost block is always \`composition "Name" { ... }\`, never \`object\`. The environment,
lights, templates and objects all go inside that one root, side by side. Inside an
object, a trait is a line starting with @ (like @grabbable) and a property is a \`key: value\` line.

A complete, real program (examples/quickstart/2-red-cube-teal-button.holo):

${HOLOSCRIPT_EXAMPLE_PROGRAM}

Object properties: geometry ("cube", "sphere", "plane", "cylinder", "cone", "torus", "capsule"),
or model: "path/to/asset.glb" for an imported mesh; position: [x, y, z], rotation: [x, y, z],
scale: n or [x, y, z]; and the surface: color: "#rrggbb", roughness and metallic (0 to 1), and
emissive: "#rrggbb" with emissiveIntensity for things that glow.
Position, rotation, scale and color are properties, not traits: write \`position: [0, 1, 0]\`.

Traits (each on its own line inside an object):
- Interaction: @grabbable, @clickable, @hoverable, @throwable, @scalable, @pointable
- Physics: @physics, @collidable, @static, @kinematic, @trigger
- Visual: @glowing, @emissive, @transparent, @animated, @billboard, @particle
- Network: @networked, @synced, @persistent
- AI: @llm_agent, @npc, @pathfinding, @state_machine
- Audio: @spatial_audio

Realistic objects (prefer this over a bare primitive + flat color whenever the request implies
anything other than a placeholder or a test object):
- Give the surface real values, color with roughness and metallic, not a color alone.
- Use a real imported mesh, model: "path/to/asset.glb", instead of a primitive shape where one
  exists. The "Boulder" program below shows both.
- Environment/lighting traits compose realism further: @time_of_day, @volumetric_clouds, @wind,
  @bioluminescent, and a real point_light paired with @emissive so it actually illuminates
  neighboring objects.
- Full pattern library: docs/handbooks/holoscript-realistic-authoring-patterns.md.

Rules:
1. Return ONLY HoloScript code: one \`composition "Name" { ... }\` program, no markdown, no explanations
2. Use realistic positions (objects should be visible, y >= 0 for floor level)
3. Group related objects logically
4. Keep scenes focused on the user's request
5. Use appropriate traits for the described behavior
6. A bare primitive + flat color is a placeholder, not a finished object — use it only for an
   explicit test/mock/stand-in request; otherwise give it real surface values (color, roughness,
   metallic) and, where a real asset exists, an imported model
7. Use exactly the names, values and blocks the request asks for, written in the forms the
   programs here show: a template that objects use, a group, a comment, a state machine

Two more whole programs (contrast a placeholder against a composed object — match the request's intent):

// Placeholder / test object
composition "Test Cube" {
  object "Cube" {
    @grabbable
    @physics
    geometry: "cube"
    position: [0, 1, 0]
    color: "#ff0000"
  }
}

// Composed, realistic object
composition "Boulder" {
  object "Boulder" {
    @collidable
    model: "models/boulder.glb"
    position: [0, 0, -3]
    color: "#8a8378"
    roughness: 0.75
    metallic: 0.0
  }
}

Templates, groups and comments (a whole program, valid as .holo and as .hsplus):

composition "Workshop" {
  template "Lantern" {
    @glowing
    @clickable
    color: "#ffb347"
    state {
      lit: true
      fuel: 100
    }
  }

  spatial_group "bench" {
    position: [2, 0.9, -3]
    // both lanterns share the Lantern template
    object "lanternLeft" using "Lantern" {
      geometry: "cylinder"
      position: [-0.4, 0, 0]
    }
    object "lanternRight" using "Lantern" {
      geometry: "cylinder"
      position: [0.4, 0, 0]
    }
  }
}

- A template holds shared traits and properties, and a \`state { }\` block for the values that
  change. An object made from it names the template with \`using\` after its own name, as
  lanternLeft does; never as a template: property.
- A spatial_group moves its objects together: its \`position:\` places the group, and the
  positions of the objects inside it are relative to that.
- When a request asks for a comment, write it as a // line of its own, directly above the
  thing it describes.

A state machine (a whole program, .holo only: the .hsplus parser does not read state
transitions yet):

composition "Crossing" {
  state_machine "signal" {
    initial: "green"
    state "green" {
      transitions: [
        {
          target: "amber"
          event: "walk_request"
        }
      ]
    }
    state "amber" {
      transitions: [
        {
          target: "red"
          event: "timer_done"
        }
      ]
    }
    state "red" {
      transitions: [
        {
          target: "green"
          event: "timer_done"
        }
      ]
    }
  }

  object "signalHead" {
    @clickable
    geometry: "cylinder"
    position: [0, 3, -4]
  }
}

- A state_machine is its own block, not a template's \`state { }\`. It names its \`initial:\`
  state. Each state lists its \`transitions:\`, one block per transition, with \`target:\` (the
  next state) and \`event:\` on lines of their own.`;

// =============================================================================
// Trait extraction regex
// =============================================================================

const TRAIT_REGEX = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Extract unique @trait references from a HoloScript code snippet.
 * Exported for direct testing — was inline-called from validateAndTrack
 * below. 2026-04-23: exported so provider.test.ts can assert its contract
 * without the class-method round-trip that broke when it moved out of
 * BaseLLMAdapter.
 */
export function extractTraits(code: string): string[] {
  const traits = new Set<string>();

  for (const match of code.matchAll(TRAIT_REGEX)) {
    traits.add(`@${match[1]}`);
  }

  return Array.from(traits);
}

// =============================================================================
// Base Adapter
// =============================================================================

export abstract class BaseLLMAdapter implements ILLMProvider {
  abstract readonly name: LLMProviderName;
  abstract readonly models: readonly string[];
  abstract readonly defaultHoloScriptModel: string;

  /**
   * Capability manifest. Conservative default (DEFAULT_CAPABILITIES) so
   * existing adapters compile without change; each adapter overrides
   * with its actual declarations to participate in capability-aware
   * routing. See `Capabilities` in types.ts for the full field set.
   */
  readonly capabilities: Capabilities = DEFAULT_CAPABILITIES;

  protected readonly config: Required<LLMProviderConfig>;

  constructor(config: LLMProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? '',
      // 5 min default — long-form generation (e.g. Claude Opus producing
      // a Lean proof or a multi-page reasoning trace) commonly takes 1-3 min.
      // Observed 2026-04-25: W01 H200 mesh-worker claimed Lean invariant-4
      // task, then aborted with "Request timed out" after 30s default — the
      // model hadn't even started streaming a substantive response. Adapters
      // (bitnet 60s, local-llm 120s, mock 5s) override this default for their
      // own latency profiles; 30s was an unreasonably tight base default.
      timeoutMs: config.timeoutMs ?? 300000,
      maxRetries: config.maxRetries ?? 3,
      defaultModel: config.defaultModel ?? this.getDefaultModel(),
    };
  }

  protected abstract getDefaultModel(): string;

  abstract complete(
    request: LLMCompletionRequest,
    model?: string,
    options?: LLMRequestOptions
  ): Promise<LLMCompletionResponse>;

  async uploadFile(_request: LLMFileUploadRequest): Promise<LLMFileMetadata> {
    throw new LLMProviderError(`${this.name} does not support uploadFile()`, this.name);
  }

  /**
   * Default `openRealtimeSession` — providers that don't support the realtime
   * voice transport axis inherit this explicit unsupported-provider throw
   * (mirror of `uploadFile`). Only adapters whose manifest declares
   * `capabilities.realtimeVoice === true` (e.g. OpenAIRealtimeAdapter) override
   * it. Realtime is a SEPARATE transport from complete()/streamCompletion().
   */
  async openRealtimeSession(_config: RealtimeSessionConfig): Promise<RealtimeSession> {
    throw new LLMProviderError(`${this.name} does not support openRealtimeSession()`, this.name);
  }

  /**
   * Default `streamCompletion` implementation: call `complete()`, then yield
   * the full response as a synthesized batch of stream chunks.
   *
   * Adapters that support NATIVE streaming (Anthropic, Ollama, OpenAI)
   * override this with a real translation of their provider's stream events
   * to `LLMStreamChunk`. Adapters that don't (Mock, BitNet, Gemini) inherit
   * this default — callers get the same chunk shape, just batched at the end
   * instead of token-by-token.
   *
   * Synthesis order: text chunks first (one `text_delta` carrying the full
   * concatenated text), then tool-use chunks (one `tool_use_start` +
   * `tool_use_end` per tool — no `tool_use_input_delta` since the input is
   * already fully parsed), finally `message_stop`. This preserves the
   * type-level invariant that `tool_use_end` carries fully-parsed input.
   */
  async *streamCompletion(
    request: LLMCompletionRequest,
    model?: string
  ): AsyncIterable<LLMStreamChunk> {
    const response = await this.complete(request, model);

    if (response.content.length > 0) {
      yield { type: 'text_delta', text: response.content };
    }

    for (const tu of response.toolUses ?? []) {
      yield { type: 'tool_use_start', id: tu.id, name: tu.name };
      yield { type: 'tool_use_end', id: tu.id, input: tu.input };
    }

    yield {
      type: 'message_stop',
      finishReason: response.finishReason,
      usage: response.usage,
      model: response.model,
      requestId: response.requestId,
      responseHeaders: response.responseHeaders,
    };
  }

  /**
   * Generate HoloScript code from a natural language description.
   *
   * Transient-error retry lives inside `complete()` (each adapter wraps its
   * call in `withRetry`). The outer retry loop that previously lived here
   * was multiplicative with the inner one (4 outer × 4 inner = 16 worst-case
   * calls on persistent rate-limits) without adding behavior the inner loop
   * doesn't already cover.
   */
  async generateHoloScript(
    request: HoloScriptGenerationRequest
  ): Promise<HoloScriptGenerationResponse> {
    const systemPrompt = request.systemPrompt ?? HOLOSCRIPT_SYSTEM_PROMPT;
    const format = request.targetFormat ?? 'hsplus';

    const userPrompt = this.buildGenerationPrompt(request.prompt, format, request.maxObjects);

    const completionRequest: LLMCompletionRequest = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 2048,
      temperature: request.temperature ?? 0.7,
    };

    const response = await this.complete(completionRequest, this.defaultHoloScriptModel);

    const code = this.extractHoloScriptCode(response.content);
    const validation = this.validateHoloScriptOutput(code);
    const detectedTraits = extractTraits(code);

    return {
      code,
      valid: validation.valid,
      errors: validation.errors,
      provider: this.name,
      usage: response.usage,
      detectedTraits,
    };
  }

  /**
   * Health check - tests connectivity and authentication.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.complete({
        messages: [{ role: 'user', content: 'Reply with just "ok"' }],
        maxTokens: 10,
        temperature: 0,
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Probe an OpenAI-compatible local inference server (llama.cpp, Ollama,
   * LM Studio, bitnet.cpp). Tries `${baseURL}/health` first, falls back to
   * `${baseURL}/v1/models` if that 404s — different runtimes ship different
   * health endpoints. 5s timeout per probe.
   *
   * `formatError` brands the error string per adapter so the failure message
   * carries the right setup hint (e.g. local-llm says "Start with: llama-server
   * -m model.gguf"; bitnet says "Run: python run_inference.py --serve").
   *
   * Local-server adapters (local-llm, bitnet) override the cloud-flavored
   * `healthCheck()` (which calls `complete()`) and delegate here instead —
   * pinging a tiny endpoint is much cheaper than a full chat round-trip.
   */
  protected async healthCheckLocalServer(
    baseURL: string,
    formatError: (baseURL: string, message: string) => string,
    options?: { headers?: Record<string, string>; authRejectedMessage?: string }
  ): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    const headers = options?.headers;
    const authRejectedMessage = options?.authRejectedMessage;
    const init = (extra?: Record<string, string>) =>
      extra && Object.keys(extra).length > 0
        ? { signal: AbortSignal.timeout(5000), headers: extra }
        : { signal: AbortSignal.timeout(5000) };
    try {
      const response = await fetch(`${baseURL}/health`, init(headers));
      if (response.status === 401 && authRejectedMessage) {
        throw new Error(authRejectedMessage);
      }
      if (!response.ok) {
        const modelsResponse = await fetch(`${baseURL}/v1/models`, init(headers));
        if (modelsResponse.status === 401 && authRejectedMessage) {
          throw new Error(authRejectedMessage);
        }
        if (!modelsResponse.ok) throw new Error(`Status ${modelsResponse.status}`);
      }
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: formatError(baseURL, message),
      };
    }
  }

  // ===========================================================================
  // Protected Helpers
  // ===========================================================================

  protected buildGenerationPrompt(
    description: string,
    format: string,
    maxObjects?: number
  ): string {
    const objectLimit = maxObjects ? ` Use at most ${maxObjects} objects.` : '';
    return `Generate a ${format} HoloScript scene for: "${description}".${objectLimit}

Return ONLY the HoloScript code, no explanations or markdown.`;
  }

  /**
   * Extract HoloScript code from LLM response, stripping markdown fences if present.
   */
  protected extractHoloScriptCode(content: string): string {
    // Strip markdown code fences (common LLM habit)
    const fencedMatch = content.match(/```(?:holoscript|holo|hsplus|hs)?\n?([\s\S]*?)```/);
    if (fencedMatch) {
      return fencedMatch[1].trim();
    }
    return content.trim();
  }

  /**
   * Basic structural validation of generated HoloScript code.
   */
  protected validateHoloScriptOutput(code: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!code || code.trim().length === 0) {
      errors.push('Generated code is empty');
      return { valid: false, errors };
    }

    // Check for markdown leakage
    if (code.includes('```')) {
      errors.push('Code contains markdown code fences');
    }

    // Check for balanced braces
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} opening, ${closeBraces} closing`);
    }

    // Check for at least one object: `object "Name" {` (the shape the system prompt
    // teaches, inside its composition), a template or spatial group, or a bare
    // primitive block. Comments do not count, and a composition, material or light
    // on its own is not an object: `// object "x"\nhello` and `composition "E" {}`
    // used to pass.
    const uncommented = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const hasNamedObject = /\b(object|template|spatial_group)\s+"[^"]*"/.test(uncommented);
    const hasPrimitiveBlock =
      /\b(cube|sphere|plane|cylinder|cone|torus|mesh|text|light|camera|scene)\s*\{/.test(
        uncommented
      );
    if (!hasNamedObject && !hasPrimitiveBlock) {
      errors.push('No recognized HoloScript object types found');
    }

    return { valid: errors.length === 0, errors };
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Run an async operation with retry on transient errors.
   *
   * Retries `LLMProviderError` instances where `retryable=true` (e.g.
   * `LLMRateLimitError`, 5xx via `mapXError`) up to `this.config.maxRetries`
   * times. `LLMAuthenticationError`, `LLMContextLengthError`, and any
   * `LLMProviderError` with `retryable=false` (4xx other than 429) throw
   * immediately. Non-`LLMProviderError` exceptions (network errors, SDK
   * shapes the adapter didn't classify) get one retry then re-throw — they
   * could be transient or programmer errors, one retry covers the common
   * "first connection from cold worker" case without masking real bugs.
   *
   * Backoff is `2^attempt * 100ms + jitter`, capped at 8000ms. When the
   * caught error is `LLMRateLimitError` with `retryAfterMs`, that value is
   * used instead of the exponential backoff.
   *
   * Adapters call this around their SDK invocation: previously the SDK's
   * own retry was disabled (`maxRetries: 0` with the comment "We handle
   * retries ourselves") but no handler existed; this is that handler.
   */
  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxRetries = this.config.maxRetries;
    let lastError: unknown;
    let unknownErrorRetried = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err) {
        lastError = err;

        if (err instanceof LLMAuthenticationError || err instanceof LLMContextLengthError) {
          throw err;
        }

        let isRetryable: boolean;
        let retryAfterMs: number | undefined;

        if (err instanceof LLMProviderError) {
          isRetryable = err.retryable;
          if (err instanceof LLMRateLimitError) {
            retryAfterMs = err.retryAfterMs;
          }
        } else {
          // Non-LLMProviderError: retry once, then surface to caller.
          if (unknownErrorRetried) throw err;
          unknownErrorRetried = true;
          isRetryable = true;
        }

        if (!isRetryable) throw err;
        if (attempt >= maxRetries) break;

        const backoffMs = Math.min(Math.pow(2, attempt) * 100, 8000);
        const jitter = Math.random() * 100;
        const delayMs = retryAfterMs ?? backoffMs + jitter;
        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Create a zero-usage TokenUsage for mock/error cases.
   */
  protected zeroUsage(): TokenUsage {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
}
