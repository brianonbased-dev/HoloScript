/**
 * SovereignGeneratorAdapter — local sovereign LLM generator surface for offline WASM contexts
 *
 * APL-WIT-3 Gap #4: Expose a minimal suggest-traits / generate-object path
 * in the generator interface that can call a local sovereign agent surface
 * (Brittney 15M path from PhoneSleeveVR revival) when running in offline
 * WASM contexts.
 *
 * Architecture:
 *   - When online: delegates to Brittney Cloud / Anthropic / Ollama via LLM provider
 *   - When offline (WASM, PhoneSleeveVR, Quest 3): uses the local 15M distilled
 *     Brittney model via WebLLM or WASM-bundled inference
 *   - Fallback: keyword-matching suggestTraits (same as existing generators.ts)
 *
 * The adapter follows the same pattern as Sovereign3DAdapter and
 * SovereignWorldAdapter — local-first, sovereign by default.
 *
 * @engine  sovereign-generator
 * @model   Brittney 15M (distilled sovereign)
 * @see     research/2026-05-21_apl_wit_trait-evaluation_gap_report.md Gap #4
 */

import { LOCAL_DEFAULT_MODEL } from '@holoscript/llm-provider';

// =============================================================================
// TYPES
// =============================================================================

/** Source of the generation result */
export type GeneratorSource = 'sovereign-local' | 'sovereign-cloud' | 'keyword-fallback' | 'mock';

/** Result from suggestTraits — mirrors generators.ts TraitSuggestionResult */
export interface TraitSuggestionResult {
  traits: string[];
  reasoning: Record<string, string>;
  confidence: number;
  /** Provenance — which surface produced this result */
  metadata: { source: GeneratorSource };
}

type TraitSuggestionPayload = Omit<TraitSuggestionResult, 'metadata'>;

/** Result from generateObject — mirrors generators.ts ObjectGenerationResult */
export interface ObjectGenerationResult {
  code: string;
  metadata: {
    description: string;
    traits: string[];
    geometry: string;
    generationMs?: number;
    source: GeneratorSource;
  };
}

/** Result from generateScene — mirrors generators.ts SceneGenerationResult */
export interface SceneGenerationResult {
  code: string;
  metadata: {
    description: string;
    objectCount: number;
    traits: string[];
    generationMs?: number;
    source: GeneratorSource;
  };
}

/** Configuration for the SovereignGeneratorAdapter */
export interface SovereignGeneratorAdapterOptions {
  /** Local Brittney inference endpoint (default: env BRITTNEY_LOCAL_ENDPOINT or http://localhost:11434) */
  localEndpoint?: string;
  /** Cloud Brittney endpoint (default: env BRITTNEY_SERVICE_URL) */
  cloudEndpoint?: string;
  /** API key for cloud endpoint (default: env BRITTNEY_API_KEY) */
  cloudApiKey?: string;
  /** Model name for local Brittney (default: qwen3.5:4b via env BRITTNEY_MODEL) */
  localModel?: string;
  /** Model name for cloud Brittney (default: brittney-standard) */
  cloudModel?: string;
  /** Max tokens for generation (default: 4096) */
  maxTokens?: number;
  /** Generation timeout in ms (default: 120_000) */
  timeoutMs?: number;
  /** Force offline mode — skip cloud even if available (default: false) */
  offlineOnly?: boolean;
  /** Mock mode — return deterministic results without inference (default: false) */
  mockMode?: boolean;
  /** Simulated latency for mock mode (default: 5) */
  mockLatencyMs?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LOCAL_ENDPOINT =
  (typeof process !== 'undefined' && process.env.BRITTNEY_LOCAL_ENDPOINT) ||
  (typeof process !== 'undefined' && process.env.OLLAMA_HOST) ||
  'http://localhost:11434';

/**
 * Default Ollama model for sovereign Brittney inference.
 * qwen3.5 replaces qwen2.5-coder (2026-06-10, founder): the older family
 * cannot emit NATIVE tool calls via Ollama — it writes the call JSON as
 * plain text, which is the tend_garden stall / zero-objects benchmark
 * failure. NOTE: the vast.ai serving pool (P.008) still serves
 * qwen2.5-coder:1.5b — upgrading the pool template is a separate task.
 * Override with BRITTNEY_MODEL env var to point at any pulled Ollama tag.
 */
export const BRITTNEY_SOVEREIGN_DEFAULT_MODEL = LOCAL_DEFAULT_MODEL;

const DEFAULT_LOCAL_MODEL =
  (typeof process !== 'undefined' && process.env.BRITTNEY_MODEL) ||
  BRITTNEY_SOVEREIGN_DEFAULT_MODEL;

const DEFAULT_CLOUD_ENDPOINT =
  (typeof process !== 'undefined' && process.env.BRITTNEY_SERVICE_URL) || '';

const DEFAULT_CLOUD_API_KEY =
  (typeof process !== 'undefined' && process.env.BRITTNEY_API_KEY) || '';

const DEFAULT_CLOUD_MODEL = 'brittney-standard';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 120_000;

/** System prompt for Brittney 15M sovereign generation */
const SOVEREIGN_GENERATE_SYSTEM_PROMPT = `You are a HoloScript code generator running locally (sovereign, no cloud).
Output ONLY valid HoloScript code, no markdown, no explanation.

HoloScript syntax:
  object "Name" {
    geometry: "cube" | "sphere" | "cylinder" | "plane" | "cone"
    position: [x, y, z]
    rotation: [x, y, z]
    scale: [x, y, z] | number
    @color(red) @emissive(cyan) @grabbable @physics @collidable
    @clickable @hoverable @networked @persistent @animated
  }

  composition "SceneName" {
    environment {
      skybox: "default"
      ambient_light: 0.5
    }
    object "Obj1" { ... }
  }

Traits available: @grabbable, @throwable, @clickable, @hoverable, @draggable,
@scalable, @physics, @collidable, @gravity, @glowing, @emissive, @transparent,
@reflective, @animated, @billboard, @networked, @synced, @persistent, @owned,
@host_only, @stackable, @attachable, @equippable, @consumable, @destructible,
@anchor, @tracked, @world_locked, @hand_tracked, @eye_tracked, @spatial_audio,
@ambient, @voice_activated, @state, @reactive, @observable, @computed,
@shareable, @collaborative, @trigger, @pointable`;

const SOVEREIGN_SUGGEST_SYSTEM_PROMPT = `You are a HoloScript trait suggestion engine running locally (sovereign, no cloud).
Given a natural language description of an object or scene, suggest appropriate HoloScript traits.

Available traits: @grabbable, @throwable, @clickable, @hoverable, @draggable, @scalable,
@physics, @collidable, @gravity, @glowing, @emissive, @transparent, @reflective,
@animated, @billboard, @networked, @synced, @persistent, @owned, @host_only,
@stackable, @attachable, @equippable, @consumable, @destructible, @anchor,
@tracked, @world_locked, @hand_tracked, @eye_tracked, @spatial_audio, @ambient,
@voice_activated, @state, @reactive, @observable, @computed, @shareable,
@collaborative, @trigger, @pointable, @state, @reactive

Output JSON only: { "traits": ["@trait1", "@trait2"], "reasoning": { "@trait1": "reason", "@trait2": "reason" }, "confidence": 0.85 }`;

// =============================================================================
// KEYWORD FALLBACK — mirrors generators.ts TRAIT_KEYWORDS for offline use
// =============================================================================

const TRAIT_KEYWORDS: Record<string, string[]> = {
  'pick up': ['@grabbable'],
  grab: ['@grabbable'],
  hold: ['@grabbable', '@holdable'],
  throw: ['@grabbable', '@throwable'],
  click: ['@clickable'],
  point: ['@pointable'],
  hover: ['@hoverable'],
  drag: ['@draggable'],
  scale: ['@scalable'],
  resize: ['@scalable'],
  collide: ['@collidable'],
  bounce: ['@collidable', '@physics'],
  physics: ['@physics', '@collidable'],
  fall: ['@physics', '@gravity'],
  gravity: ['@gravity'],
  trigger: ['@trigger'],
  glow: ['@glowing'],
  light: ['@emissive'],
  transparent: ['@transparent'],
  'see through': ['@transparent'],
  reflect: ['@reflective'],
  mirror: ['@reflective'],
  animate: ['@animated'],
  spin: ['@animated'],
  rotate: ['@animated'],
  billboard: ['@billboard'],
  'face camera': ['@billboard'],
  multiplayer: ['@networked', '@synced'],
  sync: ['@networked', '@synced'],
  network: ['@networked'],
  save: ['@persistent'],
  persist: ['@persistent'],
  own: ['@owned'],
  host: ['@host_only'],
  stack: ['@stackable'],
  attach: ['@attachable'],
  equip: ['@equippable'],
  wear: ['@equippable'],
  consume: ['@consumable'],
  eat: ['@consumable'],
  drink: ['@consumable'],
  destroy: ['@destructible'],
  break: ['@destructible'],
  anchor: ['@anchor'],
  track: ['@tracked'],
  'world lock': ['@world_locked'],
  'hand track': ['@hand_tracked'],
  'eye track': ['@eye_tracked'],
  sound: ['@spatial_audio'],
  audio: ['@spatial_audio'],
  ambient: ['@ambient'],
  voice: ['@voice_activated'],
  speak: ['@voice_activated'],
  state: ['@state', '@reactive'],
  react: ['@reactive'],
  observe: ['@observable'],
  compute: ['@computed'],
  share: ['@shareable'],
  collaborate: ['@collaborative'],
  tweet: ['@tweetable'],
};

// =============================================================================
// ADAPTER
// =============================================================================

export class SovereignGeneratorAdapter {
  readonly id = 'sovereign-generator';

  private readonly localEndpoint: string;
  private readonly cloudEndpoint: string;
  private readonly cloudApiKey: string;
  private readonly localModel: string;
  private readonly cloudModel: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly offlineOnly: boolean;
  private readonly mockMode: boolean;
  private readonly mockLatencyMs: number;

  constructor(options: SovereignGeneratorAdapterOptions = {}) {
    this.localEndpoint = (options.localEndpoint ?? DEFAULT_LOCAL_ENDPOINT).replace(/\/$/, '');
    this.cloudEndpoint = (options.cloudEndpoint ?? DEFAULT_CLOUD_ENDPOINT).replace(/\/$/, '');
    this.cloudApiKey = options.cloudApiKey ?? DEFAULT_CLOUD_API_KEY;
    this.localModel = options.localModel ?? DEFAULT_LOCAL_MODEL;
    this.cloudModel = options.cloudModel ?? DEFAULT_CLOUD_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.offlineOnly = options.offlineOnly ?? false;
    this.mockMode = options.mockMode ?? false;
    this.mockLatencyMs = Math.max(0, options.mockLatencyMs ?? 5);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — suggestTraits
  // ---------------------------------------------------------------------------

  /**
   * Suggest HoloScript traits for a natural language description.
   *
   * Resolution order:
   *   1. Local Brittney (Ollama/WebLLM) — sovereign, offline-capable
   *   2. Cloud Brittney — if online and not offlineOnly
   *   3. Keyword fallback — deterministic, no LLM needed
   */
  async suggestTraits(description: string, context?: string): Promise<TraitSuggestionResult> {
    if (this.mockMode) {
      await this.sleep(this.mockLatencyMs);
      return this.keywordSuggestTraits(description, context, 'mock');
    }

    // Try local Brittney first (sovereign, offline-capable)
    try {
      const localResult = await this.localSuggestTraits(description, context);
      if (localResult) {
        return { ...localResult, metadata: { source: 'sovereign-local' as const } };
      }
    } catch {
      // Local unavailable — fall through to cloud or keyword
    }

    // Try cloud Brittney if not offline-only
    if (!this.offlineOnly && this.cloudEndpoint) {
      try {
        const cloudResult = await this.cloudSuggestTraits(description, context);
        if (cloudResult) {
          return { ...cloudResult, metadata: { source: 'sovereign-cloud' as const } };
        }
      } catch {
        // Cloud unavailable — fall through to keyword fallback
      }
    }

    // Keyword fallback — always available, no LLM needed
    return this.keywordSuggestTraits(description, context, 'keyword-fallback');
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — generateObject
  // ---------------------------------------------------------------------------

  /**
   * Generate a HoloScript object from natural language.
   *
   * Resolution order mirrors suggestTraits:
   *   1. Local Brittney (sovereign)
   *   2. Cloud Brittney
   *   3. Keyword/template fallback
   */
  async generateObject(description: string): Promise<ObjectGenerationResult> {
    if (this.mockMode) {
      await this.sleep(this.mockLatencyMs);
      return this.templateGenerateObject(description, 'mock');
    }

    // Try local Brittney first
    try {
      const localResult = await this.localGenerate(description, 'object');
      if (localResult) {
        return {
          code: localResult,
          metadata: {
            description,
            traits: this.extractTraitsFromCode(localResult),
            geometry: this.extractGeometryFromCode(localResult),
            source: 'sovereign-local',
          },
        };
      }
    } catch {
      // fall through
    }

    // Try cloud Brittney
    if (!this.offlineOnly && this.cloudEndpoint) {
      try {
        const cloudResult = await this.cloudGenerate(description, 'object');
        if (cloudResult) {
          return {
            code: cloudResult,
            metadata: {
              description,
              traits: this.extractTraitsFromCode(cloudResult),
              geometry: this.extractGeometryFromCode(cloudResult),
              source: 'sovereign-cloud',
            },
          };
        }
      } catch {
        // fall through
      }
    }

    // Template fallback
    return this.templateGenerateObject(description, 'keyword-fallback');
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API — generateScene
  // ---------------------------------------------------------------------------

  /**
   * Generate a complete HoloScript composition from natural language.
   */
  async generateScene(description: string): Promise<SceneGenerationResult> {
    if (this.mockMode) {
      await this.sleep(this.mockLatencyMs);
      return this.templateGenerateScene(description, 'mock');
    }

    // Try local Brittney first
    try {
      const localResult = await this.localGenerate(description, 'scene');
      if (localResult) {
        return {
          code: localResult,
          metadata: {
            description,
            objectCount: this.countObjects(localResult),
            traits: this.extractTraitsFromCode(localResult),
            source: 'sovereign-local',
          },
        };
      }
    } catch {
      // fall through
    }

    // Try cloud Brittney
    if (!this.offlineOnly && this.cloudEndpoint) {
      try {
        const cloudResult = await this.cloudGenerate(description, 'scene');
        if (cloudResult) {
          return {
            code: cloudResult,
            metadata: {
              description,
              objectCount: this.countObjects(cloudResult),
              traits: this.extractTraitsFromCode(cloudResult),
              source: 'sovereign-cloud',
            },
          };
        }
      } catch {
        // fall through
      }
    }

    // Template fallback
    return this.templateGenerateScene(description, 'keyword-fallback');
  }

  // ---------------------------------------------------------------------------
  // LOCAL BRITTNEY (Ollama / WebLLM)
  // ---------------------------------------------------------------------------

  private async localSuggestTraits(
    description: string,
    context?: string
  ): Promise<TraitSuggestionPayload | null> {
    const prompt = context
      ? `Description: "${description}"\nContext: "${context}"`
      : `Description: "${description}"`;

    const body = {
      model: this.localModel,
      messages: [
        { role: 'system', content: SOVEREIGN_SUGGEST_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: false,
      options: { num_predict: 512 },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.localEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      return this.parseTraitSuggestion(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async localGenerate(
    description: string,
    kind: 'object' | 'scene'
  ): Promise<string | null> {
    const prompt =
      kind === 'scene'
        ? `Generate a HoloScript composition for: ${description}`
        : `Generate a HoloScript object for: ${description}`;

    const body = {
      model: this.localModel,
      messages: [
        { role: 'system', content: SOVEREIGN_GENERATE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: false,
      options: { num_predict: this.maxTokens },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.localEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      // Strip markdown code fences if present
      return this.stripCodeFences(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // CLOUD BRITTNEY
  // ---------------------------------------------------------------------------

  private async cloudSuggestTraits(
    description: string,
    context?: string
  ): Promise<TraitSuggestionPayload | null> {
    const prompt = context
      ? `Description: "${description}"\nContext: "${context}"`
      : `Description: "${description}"`;

    const body = {
      model: this.cloudModel,
      messages: [
        { role: 'system', content: SOVEREIGN_SUGGEST_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: false,
      max_tokens: 512,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.cloudApiKey ? { Authorization: `Bearer ${this.cloudApiKey}` } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.cloudEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      return this.parseTraitSuggestion(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async cloudGenerate(
    description: string,
    kind: 'object' | 'scene'
  ): Promise<string | null> {
    const prompt =
      kind === 'scene'
        ? `Generate a HoloScript composition for: ${description}`
        : `Generate a HoloScript object for: ${description}`;

    const body = {
      model: this.cloudModel,
      messages: [
        { role: 'system', content: SOVEREIGN_GENERATE_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      stream: false,
      max_tokens: this.maxTokens,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.cloudApiKey ? { Authorization: `Bearer ${this.cloudApiKey}` } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.cloudEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      return this.stripCodeFences(content);
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // KEYWORD / TEMPLATE FALLBACK — deterministic, no LLM
  // ---------------------------------------------------------------------------

  private keywordSuggestTraits(
    description: string,
    context: string | undefined,
    source: 'mock' | 'keyword-fallback'
  ): TraitSuggestionResult {
    const lowerDesc = (description + ' ' + (context || '')).toLowerCase();
    const suggestedTraits = new Set<string>();
    const reasoning: Record<string, string> = {};

    for (const [keyword, traits] of Object.entries(TRAIT_KEYWORDS)) {
      if (lowerDesc.includes(keyword)) {
        for (const trait of traits) {
          if (!suggestedTraits.has(trait)) {
            suggestedTraits.add(trait);
            reasoning[trait] = `Suggested because description mentions "${keyword}"`;
          }
        }
      }
    }

    // Default trait for interactive objects
    if (suggestedTraits.size === 0) {
      suggestedTraits.add('@pointable');
      reasoning['@pointable'] = 'Default trait for interactive objects';
    }

    // Always suggest @collidable if physics-related
    if (suggestedTraits.has('@physics') && !suggestedTraits.has('@collidable')) {
      suggestedTraits.add('@collidable');
      reasoning['@collidable'] = 'Required for physics interactions';
    }

    const traits = Array.from(suggestedTraits);
    const confidence = Math.min(0.95, 0.5 + traits.length * 0.1);

    return {
      traits,
      reasoning,
      confidence,
      metadata: { source },
    };
  }

  private templateGenerateObject(
    description: string,
    source: 'mock' | 'keyword-fallback'
  ): ObjectGenerationResult {
    const { traits } = this.keywordSuggestTraits(
      description,
      undefined,
      source === 'mock' ? 'mock' : 'keyword-fallback'
    );
    const code = `object "Generated" {
  // Generated from: ${description}
  geometry: "cube"
  position: [0, 1, 0]
${traits.length > 0 ? '  ' + traits.join('\n  ') : ''}
}`;

    return {
      code,
      metadata: {
        description,
        traits,
        geometry: 'cube',
        source,
      },
    };
  }

  private templateGenerateScene(
    description: string,
    source: 'mock' | 'keyword-fallback'
  ): SceneGenerationResult {
    const { traits } = this.keywordSuggestTraits(
      description,
      undefined,
      source === 'mock' ? 'mock' : 'keyword-fallback'
    );
    const code = `composition "Generated Scene" {
  // Generated from: ${description}
  environment {
    skybox: "default"
    ambient_light: 0.5
  }

  object "Object1" {
    geometry: "cube"
    position: [0, 1, 0]
${traits.length > 0 ? '    ' + traits.join('\n    ') : ''}
  }
}`;

    return {
      code,
      metadata: {
        description,
        objectCount: 1,
        traits,
        source,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // PARSING UTILITIES
  // ---------------------------------------------------------------------------

  private parseTraitSuggestion(content: string): TraitSuggestionPayload | null {
    try {
      // Strip markdown code fences
      const stripped = this.stripCodeFences(content).trim();
      // Extract JSON from the response
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as {
        traits?: string[];
        reasoning?: Record<string, string>;
        confidence?: number;
      };

      if (!Array.isArray(parsed.traits)) return null;

      return {
        traits: parsed.traits.filter((t: unknown) => typeof t === 'string'),
        reasoning: parsed.reasoning ?? {},
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      };
    } catch {
      return null;
    }
  }

  private stripCodeFences(code: string): string {
    // Remove ```holoscript ... ``` or ``` ... ``` fences
    return code
      .replace(/^```(?:holoscript|hs|holo)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();
  }

  private extractTraitsFromCode(code: string): string[] {
    const traitPattern = /@[\w]+/g;
    const matches = code.match(traitPattern);
    return matches ? [...new Set(matches)] : [];
  }

  private extractGeometryFromCode(code: string): string {
    const geoMatch = code.match(/geometry:\s*"(\w+)"/);
    return geoMatch?.[1] ?? 'unknown';
  }

  private countObjects(code: string): number {
    const objectMatches = code.match(/\bobject\s+"/g);
    return objectMatches ? objectMatches.length : 1;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
