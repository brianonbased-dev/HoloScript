/**
 * @holoscript/core AI Adapter Interface
 *
 * Provider-agnostic AI integration for HoloScript.
 * Users can implement this interface to integrate any AI service.
 *
 * @example
 * ```typescript
 * import { AIAdapter, registerAIAdapter } from '@holoscript/core';
 *
 * // Implement your own adapter
 * class MyOpenAIAdapter implements AIAdapter {
 *   async generateHoloScript(prompt: string) {
 *     const response = await openai.chat.completions.create({...});
 *     return { holoScript: response.choices[0].message.content };
 *   }
 * }
 *
 * // Register it
 * registerAIAdapter(new MyOpenAIAdapter());
 * ```
 */

// ============================================================================
// Core AI Adapter Interface
// ============================================================================

/**
 * Result of HoloScript generation from natural language
 */
export interface GenerateResult {
  /** Generated HoloScript code */
  holoScript: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Estimated object count */
  objectCount?: number;
  /** Any warnings or suggestions */
  warnings?: string[];
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of HoloScript explanation
 */
export interface ExplainResult {
  /** Human-readable explanation */
  explanation: string;
  /** Line-by-line breakdown */
  breakdown?: Array<{
    line: number;
    code: string;
    description: string;
  }>;
}

/**
 * Result of HoloScript optimization
 */
export interface OptimizeResult {
  /** Optimized HoloScript code */
  holoScript: string;
  /** What was improved */
  improvements: string[];
  /** Performance metrics comparison */
  metrics?: {
    before: { polygons?: number; nodes?: number };
    after: { polygons?: number; nodes?: number };
  };
}

/**
 * Result of HoloScript validation/fixing
 */
export interface FixResult {
  /** Fixed HoloScript code */
  holoScript: string;
  /** Issues that were fixed */
  fixes: Array<{
    line: number;
    issue: string;
    fix: string;
  }>;
  /** Issues that couldn't be fixed automatically */
  remaining?: string[];
}

/**
 * Generation options
 */
export interface GenerateOptions {
  /** Style hint: modern, classic, minimal, realistic */
  style?: 'modern' | 'classic' | 'minimal' | 'realistic';
  /** Complexity level */
  complexity?: 'low' | 'medium' | 'high';
  /** Include physics simulation */
  includePhysics?: boolean;
  /** Target platform for optimization */
  targetPlatform?: 'mobile' | 'desktop' | 'vr' | 'ar';
  /** Maximum tokens/length */
  maxTokens?: number;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Additional context about the world */
  context?: string;
}

/**
 * AI Adapter Interface
 *
 * Implement this interface to integrate any AI provider with HoloScript.
 * All methods are optional - implement only what your provider supports.
 */
export interface AIAdapter {
  /** Unique identifier for this adapter */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Whether the adapter is ready to use */
  isReady(): boolean | Promise<boolean>;

  /**
   * Generate HoloScript from natural language
   * @param prompt User's natural language description
   * @param options Generation options
   */
  generateHoloScript?(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;

  /**
   * Explain what HoloScript code does
   * @param holoScript The code to explain
   */
  explainHoloScript?(holoScript: string): Promise<ExplainResult>;

  /**
   * Optimize HoloScript for a target platform
   * @param holoScript The code to optimize
   * @param target Target platform
   */
  optimizeHoloScript?(
    holoScript: string,
    target: 'mobile' | 'desktop' | 'vr' | 'ar'
  ): Promise<OptimizeResult>;

  /**
   * Fix errors in HoloScript code
   * @param holoScript The code to fix
   * @param errors Error messages from parser/validator
   */
  fixHoloScript?(holoScript: string, errors: string[]): Promise<FixResult>;

  /**
   * Complete HoloScript code (autocomplete)
   * @param holoScript Partial code
   * @param cursorPosition Position of cursor
   */
  completeHoloScript?(holoScript: string, cursorPosition: number): Promise<string[]>;

  /**
   * Chat with AI about HoloScript code
   * @param message User message
   * @param holoScript Current code context
   * @param history Previous messages
   */
  chat?(
    message: string,
    holoScript?: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string>;

  /**
   * Get vector embeddings for text
   * @param text Text to embed
   */
  getEmbeddings?(text: string | string[]): Promise<number[][]>;
}

// ============================================================================
// Adapter Registry
// ============================================================================

let _defaultAdapter: AIAdapter | null = null;
const _adapters = new Map<string, AIAdapter>();

/**
 * Register an AI adapter
 * @param adapter The adapter to register
 * @param setAsDefault Whether to set as the default adapter
 */
export function registerAIAdapter(adapter: AIAdapter, setAsDefault = false): void {
  _adapters.set(adapter.id, adapter);
  if (setAsDefault || _defaultAdapter === null) {
    _defaultAdapter = adapter;
  }
}

/**
 * Get an AI adapter by ID
 * @param id Adapter ID
 */
export function getAIAdapter(id: string): AIAdapter | undefined {
  return _adapters.get(id);
}

/**
 * Get the default AI adapter
 */
export function getDefaultAIAdapter(): AIAdapter | null {
  return _defaultAdapter;
}

/**
 * Set the default AI adapter
 * @param id Adapter ID
 */
export function setDefaultAIAdapter(id: string): boolean {
  const adapter = _adapters.get(id);
  if (adapter) {
    _defaultAdapter = adapter;
    return true;
  }
  return false;
}

/**
 * List all registered adapters
 */
export function listAIAdapters(): Array<{ id: string; name: string }> {
  return Array.from(_adapters.values()).map((a) => ({
    id: a.id,
    name: a.name,
  }));
}

/**
 * Unregister an AI adapter
 * @param id Adapter ID
 */
export function unregisterAIAdapter(id: string): boolean {
  const deleted = _adapters.delete(id);
  if (deleted && _defaultAdapter?.id === id) {
    const firstAdapter = _adapters.values().next().value;
    _defaultAdapter = firstAdapter ?? null;
  }
  return deleted;
}

// ============================================================================
// Convenience Functions (use default adapter)
// ============================================================================

/**
 * Generate HoloScript from natural language using the default adapter
 */
export async function generateHoloScript(
  prompt: string,
  options?: GenerateOptions
): Promise<GenerateResult> {
  if (!_defaultAdapter) {
    throw new Error(
      'No AI adapter registered. Call registerAIAdapter() first or use @holoscript/infinityassistant for Infinity Assistant integration.'
    );
  }
  if (!_defaultAdapter.generateHoloScript) {
    throw new Error(`AI adapter "${_defaultAdapter.name}" does not support generateHoloScript`);
  }
  return _defaultAdapter.generateHoloScript(prompt, options);
}

/**
 * Explain HoloScript code using the default adapter
 */
export async function explainHoloScript(holoScript: string): Promise<ExplainResult> {
  if (!_defaultAdapter) {
    throw new Error('No AI adapter registered.');
  }
  if (!_defaultAdapter.explainHoloScript) {
    throw new Error(`AI adapter "${_defaultAdapter.name}" does not support explainHoloScript`);
  }
  return _defaultAdapter.explainHoloScript(holoScript);
}

/**
 * Optimize HoloScript using the default adapter
 */
export async function optimizeHoloScript(
  holoScript: string,
  target: 'mobile' | 'desktop' | 'vr' | 'ar'
): Promise<OptimizeResult> {
  if (!_defaultAdapter) {
    throw new Error('No AI adapter registered.');
  }
  if (!_defaultAdapter.optimizeHoloScript) {
    throw new Error(`AI adapter "${_defaultAdapter.name}" does not support optimizeHoloScript`);
  }
  return _defaultAdapter.optimizeHoloScript(holoScript, target);
}

/**
 * Fix HoloScript errors using the default adapter
 */
export async function fixHoloScript(holoScript: string, errors: string[]): Promise<FixResult> {
  if (!_defaultAdapter) {
    throw new Error('No AI adapter registered.');
  }
  if (!_defaultAdapter.fixHoloScript) {
    throw new Error(`AI adapter "${_defaultAdapter.name}" does not support fixHoloScript`);
  }
  return _defaultAdapter.fixHoloScript(holoScript, errors);
}
