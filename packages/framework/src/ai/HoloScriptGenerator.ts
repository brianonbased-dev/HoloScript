/**
 * AI-Guided HoloScript Generation
 *
 * High-level API for generating validated HoloScript from natural language.
 * Combines AI adapters with the parser to:
 * - Generate code from prompts
 * - Validate generated code
 * - Fix errors automatically
 * - Optimize for target platforms
 * - Maintain generation history
 */

import type { AIAdapter } from './AIAdapter';
import { HoloCompositionParser, parseHoloStrict } from '@holoscript/core/parser';
import type { HoloParseResult } from '@holoscript/core/parser';
import { VR_TRAITS } from '@holoscript/core/constants';

import type { HSPlusCompileResult } from '@holoscript/core';
import { GenerationCache } from './GenerationCache';
import { GenerationAnalytics } from './GenerationAnalytics';

// =============================================================================
// TYPES
// =============================================================================

export interface GenerationConfig {
  /** Maximum attempts to generate valid code */
  maxAttempts: number;
  /** Target platform for optimization */
  targetPlatform: 'mobile' | 'desktop' | 'vr' | 'ar';
  /** Auto-fix errors if generation is invalid */
  autoFix: boolean;
  /** Minimum confidence threshold (0-1) */
  minConfidence: number;
}

export interface GeneratedCode {
  /** The generated HoloScript code */
  holoScript: string;
  /** Confidence score from AI (0-1) */
  aiConfidence: number;
  /** Parse result */
  parseResult: HSPlusCompileResult;
  /** Was auto-fixed */
  wasFixed: boolean;
  /** Number of attempts before success */
  attempts: number;
  /** Explanation of generated code */
  explanation?: string;
}

export interface GenerationHistory {
  /** Prompt that was used */
  prompt: string;
  /** Generated code */
  generated: GeneratedCode;
  /** Timestamp */
  timestamp: Date;
  /** Attempt number in session */
  sessionAttempt: number;
}

export interface GenerationSession {
  /** Unique session ID */
  sessionId: string;
  /** All generations in this session */
  history: GenerationHistory[];
  /** AI adapter used */
  adapter: AIAdapter;
  /** Configuration */
  config: GenerationConfig;
}

// =============================================================================
// STRICT VALIDATION
// =============================================================================

/** A diagnostic from validation. `severity: 'warning'` never fails a generation. */
export interface ValidationDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
}

/** Anything with HoloCompositionParser's `parse` shape (injectable for tests). */
export interface CompositionParserLike {
  parse(source: string): HoloParseResult;
}

/** The parts of a core parse diagnostic this validator reads. */
type CoreDiagnostic = { message: string; loc?: unknown; code?: string; severity?: string };

let knownTraitIndex: Set<string> | null = null;

/** snake_case, no '@', lowercase: the same normalisation as the strict layer (core/strict). */
function normalizeTrait(name: string): string {
  return String(name)
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

function isKnownTrait(name: string): boolean {
  if (!knownTraitIndex) {
    knownTraitIndex = new Set<string>();
    for (const id of VR_TRAITS as readonly string[]) {
      const n = normalizeTrait(id);
      knownTraitIndex.add(n);
      knownTraitIndex.add(n.replace(/_/g, ''));
    }
  }
  const n = normalizeTrait(name);
  return knownTraitIndex.has(n) || knownTraitIndex.has(n.replace(/_/g, ''));
}

/** Every trait node in the composition AST, with the nearest location. */
function collectTraits(
  node: unknown,
  found: Array<{ name: string; line: number; column: number }> = [],
  loc: { line: number; column: number } = { line: 1, column: 1 }
) {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collectTraits(item, found, loc);
    return found;
  }
  const n = node as Record<string, any>;
  const here = n.loc ? locOf(n.loc) : loc;
  if ((n.type === 'ObjectTrait' || n.type === 'Trait') && typeof n.name === 'string') {
    found.push({ name: n.name, ...here });
  }
  for (const value of Object.values(n)) {
    if (value && typeof value === 'object') collectTraits(value, found, here);
  }
  return found;
}

/** Core locations are { line, column } or { start: { line, column } }. */
function locOf(loc: any): { line: number; column: number } {
  const p = loc?.start ?? loc;
  return { line: typeof p?.line === 'number' ? p.line : 1, column: typeof p?.column === 'number' ? p.column : 1 };
}

function failure(code: string, message: string, line = 1, column = 1): HSPlusCompileResult {
  const d: ValidationDiagnostic = { code, severity: 'error', message, line, column };
  return { success: false, errors: [d], warnings: [], ast: null } as unknown as HSPlusCompileResult;
}

/**
 * Validate generated HoloScript as a `.holo` composition, which is what the adapters are
 * told to emit (base-adapter.ts system prompt), using core's HoloCompositionParser in
 * non-tolerant mode plus parseHoloStrict's empty-composition refusal.
 *
 * Follows packages/core/strict/ERROR_CONTRACT.md:
 * - empty / whitespace-only / comment-only output fails (HS1001) and is never cached;
 * - any parser error fails (HS1007): garbage, unbalanced or unclosed blocks, non-HoloScript;
 * - a parser throw fails (HS1010), never succeeds;
 * - an unknown trait is HS1006, a WARNING: the generator has no closed vocabulary, and
 *   plugins add traits, so a well-formed composition is never failed over its traits.
 */
export function validateHoloScript(
  code: string,
  parser: CompositionParserLike = new HoloCompositionParser({ tolerant: false })
): HSPlusCompileResult {
  if (typeof code !== 'string') return failure('HS1009', 'Generated HoloScript is not a string');
  if (code.trim() === '') return failure('HS1001', 'Generated HoloScript is empty');
  let r: HoloParseResult;
  try {
    r = parser.parse(code);
  } catch (e) {
    return failure('HS1010', `Parser threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  const errors: ValidationDiagnostic[] = (Array.isArray(r?.errors) ? r.errors : [])
    .filter((e: CoreDiagnostic) => e.severity !== 'warning')
    .map((e: CoreDiagnostic) => ({
      code: e.code && /^HS\d+$/.test(e.code) ? e.code : 'HS1007',
      severity: 'error' as const,
      message: e.message,
      ...locOf(e.loc),
    }));
  if (!r?.success || !r.ast || errors.length > 0) {
    if (errors.length === 0) errors.push({ code: 'HS1004', severity: 'error', message: 'Nothing parsed into the composition', line: 1, column: 1 });
    return { success: false, errors, warnings: [], ast: null } as unknown as HSPlusCompileResult;
  }
  // Same rule as parseHoloStrict: a source of only whitespace/comments is refused (HS1001).
  try {
    parseHoloStrict(code);
  } catch (e) {
    return failure('HS1001', e instanceof Error ? e.message : String(e));
  }
  const warnings: ValidationDiagnostic[] = (Array.isArray(r.warnings) ? r.warnings : []).map((w: CoreDiagnostic) => ({
    code: 'HS1008',
    severity: 'warning' as const,
    message: w.message,
    ...locOf(w.loc),
  }));
  for (const t of collectTraits(r.ast)) {
    if (t.name && !isKnownTrait(t.name)) {
      warnings.push({
        code: 'HS1006',
        severity: 'warning',
        message: `Unknown trait @${t.name.replace(/^@/, '')} (not in core's trait vocabulary)`,
        line: t.line,
        column: t.column,
      });
    }
  }
  return { success: true, errors: [], warnings, ast: r.ast } as unknown as HSPlusCompileResult;
}
// =============================================================================
// AI-GUIDED GENERATOR
// =============================================================================

export class HoloScriptGenerator {
  private parser: CompositionParserLike;
  private currentSession?: GenerationSession;
  private sessionCounter = 0;
  private cache: GenerationCache;
  private analytics: GenerationAnalytics;
  private cacheEnabled: boolean = true;

  constructor(enableCache: boolean = true) {
    this.parser = new HoloCompositionParser({ tolerant: false });
    this.cache = new GenerationCache();
    this.analytics = new GenerationAnalytics();
    this.cacheEnabled = enableCache;
  }

  private validate(code: string): HSPlusCompileResult {
    return validateHoloScript(code, this.parser);
  }

  /**
   * Create a new generation session
   */
  createSession(adapter: AIAdapter, config: Partial<GenerationConfig> = {}): GenerationSession {
    const defaultConfig: GenerationConfig = {
      maxAttempts: 3,
      targetPlatform: 'vr',
      autoFix: true,
      minConfidence: 0.7,
      ...config,
    };

    const session: GenerationSession = {
      sessionId: `session-${Date.now()}-${++this.sessionCounter}`,
      history: [],
      adapter,
      config: defaultConfig,
    };

    this.currentSession = session;
    return session;
  }

  /**
   * Generate HoloScript from a natural language prompt
   */
  async generate(prompt: string, session?: GenerationSession): Promise<GeneratedCode> {
    const s = session || this.currentSession;
    if (!s) {
      throw new Error('No generation session created. Call createSession first.');
    }

    // Try cache first
    if (this.cacheEnabled) {
      const cachedEntry = this.cache.get(prompt, s.adapter.name);
      const cachedParse = cachedEntry ? this.validate(cachedEntry.code) : null;
      if (cachedEntry && cachedParse?.success) {
        // Record cache hit in analytics
        this.analytics.recordMetric({
          promptLength: prompt.length,
          codeLength: cachedEntry.code.length,
          confidence: 1.0, // Cached results are highly confident
          parseSuccess: true,
          errorCount: 0,
          wasFixed: false,
          responseTimeMs: 0,
          attemptsNeeded: 1,
          adapterName: s.adapter.name,
          timestamp: new Date(),
        });

        const parseResult = cachedParse;
        const generated: GeneratedCode = {
          holoScript: cachedEntry.code,
          aiConfidence: 1.0,
          parseResult,
          wasFixed: false,
          attempts: 1,
        };

        // Get explanation
        try {
          if (s.adapter.explainHoloScript) {
            const explanation = await s.adapter.explainHoloScript(generated.holoScript);
            generated.explanation = explanation.explanation;
          }
        } catch {
          // Explanation is optional
        }

        // Record in history
        s.history.push({
          prompt,
          generated,
          timestamp: new Date(),
          sessionAttempt: s.history.length + 1,
        });

        return generated;
      }
    }

    let attempts = 0;
    let lastError: Error | null = null;
    let generated: GeneratedCode | null = null;
    const startTime = performance.now();

    while (attempts < s.config.maxAttempts) {
      attempts++;

      try {
        // Generate code via AI
        if (!s.adapter.generateHoloScript) {
          throw new Error(`Adapter "${s.adapter.name}" does not support generateHoloScript`);
        }
        const result = await s.adapter.generateHoloScript(prompt);
        const responseTimeMs = performance.now() - startTime;

        // Check confidence threshold
        if ((result.confidence ?? 0) < s.config.minConfidence) {
          console.warn(`Generated code has low confidence (${result.confidence}). Retrying...`);

          this.analytics.recordMetric({
            promptLength: prompt.length,
            codeLength: result.holoScript.length,
            confidence: result.confidence ?? 0,
            parseSuccess: false,
            errorCount: 1,
            wasFixed: false,
            responseTimeMs,
            attemptsNeeded: attempts,
            adapterName: s.adapter.name,
            timestamp: new Date(),
          });

          continue;
        }

        // Parse the generated code
        const parseResult = this.validate(result.holoScript);

        let holoScript = result.holoScript;
        let wasFixed = false;

        // Auto-fix if enabled and parsing failed
        if (!parseResult.success && s.config.autoFix && attempts < s.config.maxAttempts) {
          if (!s.adapter.fixHoloScript) {
            throw new Error(`Adapter "${s.adapter.name}" does not support fixHoloScript`);
          }
          const fixResult = await s.adapter.fixHoloScript(
            result.holoScript,
            parseResult.errors.map((e: any) => e.message)
          );

          const fixedParseResult = this.validate(fixResult.holoScript);

          // If fixed version is better, use it
          if (
            fixedParseResult.success ||
            fixedParseResult.errors.length < parseResult.errors.length
          ) {
            holoScript = fixResult.holoScript;
            wasFixed = true;
            // Re-parse with fixed code
            const reparseResult = this.validate(holoScript);
            generated = {
              holoScript,
              aiConfidence: result.confidence ?? 0,
              parseResult: reparseResult,
              wasFixed,
              attempts,
            };

            // Cache successful result
            if (this.cacheEnabled && reparseResult.success) {
              this.cache.set(prompt, holoScript, result.confidence ?? 0, s.adapter.name);
            }

            break;
          }
        }

        // If we got here, use the generated code (even if not fully valid)
        generated = {
          holoScript,
          aiConfidence: result.confidence ?? 0,
          parseResult,
          wasFixed,
          attempts,
        };

        // Record metrics
        this.analytics.recordMetric({
          promptLength: prompt.length,
          codeLength: holoScript.length,
          confidence: result.confidence ?? 0,
          parseSuccess: parseResult.success,
          errorCount: parseResult.errors.length,
          wasFixed,
          responseTimeMs,
          attemptsNeeded: attempts,
          adapterName: s.adapter.name,
          timestamp: new Date(),
        });

        // Cache successful results
        if (this.cacheEnabled && parseResult.success) {
          this.cache.set(prompt, holoScript, result.confidence ?? 0, s.adapter.name);
        }

        if (parseResult.success) {
          break; // Success!
        }

        // If parsing failed and we can't auto-fix, log error and continue
        lastError = new Error(`Parse failed: ${parseResult.errors[0]?.message || 'Unknown error'}`);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        this.analytics.recordMetric({
          promptLength: prompt.length,
          codeLength: 0,
          confidence: 0,
          parseSuccess: false,
          errorCount: 1,
          wasFixed: false,
          responseTimeMs: performance.now() - startTime,
          attemptsNeeded: attempts,
          adapterName: s.adapter.name,
          timestamp: new Date(),
        });
      }
    }

    if (!generated) {
      throw (
        lastError || new Error(`Failed to generate valid HoloScript after ${attempts} attempts`)
      );
    }

    // Get explanation
    try {
      if (s.adapter.explainHoloScript) {
        const explanation = await s.adapter.explainHoloScript(generated.holoScript);
        generated.explanation = explanation.explanation;
      }
    } catch {
      // Explanation is optional
    }

    // Record in history
    s.history.push({
      prompt,
      generated,
      timestamp: new Date(),
      sessionAttempt: s.history.length + 1,
    });

    return generated;
  }

  /**
   * Optimize generated code for a target platform
   */
  async optimize(
    code: string,
    targetPlatform: 'mobile' | 'desktop' | 'vr' | 'ar',
    session?: GenerationSession
  ): Promise<GeneratedCode> {
    const s = session || this.currentSession;
    if (!s) {
      throw new Error('No generation session created. Call createSession first.');
    }

    // Optimize via AI
    if (!s.adapter.optimizeHoloScript) {
      throw new Error(`Adapter "${s.adapter.name}" does not support optimizeHoloScript`);
    }
    const optimized = await s.adapter.optimizeHoloScript(code, targetPlatform);

    // Parse optimized code
    const parseResult = this.validate(optimized.holoScript);

    return {
      holoScript: optimized.holoScript,
      aiConfidence: 0.9, // Optimization is usually reliable
      parseResult,
      wasFixed: false,
      attempts: 1,
    };
  }

  /**
   * Fix invalid HoloScript code
   */
  async fix(code: string, session?: GenerationSession): Promise<GeneratedCode> {
    const s = session || this.currentSession;
    if (!s) {
      throw new Error('No generation session created. Call createSession first.');
    }

    // Parse current code to find errors
    const parseResult = this.validate(code);
    const errors = parseResult.errors.map((e: any) => e.message);

    if (errors.length === 0) {
      return {
        holoScript: code,
        aiConfidence: 1.0,
        parseResult,
        wasFixed: false,
        attempts: 1,
      };
    }

    // Fix via AI
    if (!s.adapter.fixHoloScript) {
      throw new Error(`Adapter "${s.adapter.name}" does not support fixHoloScript`);
    }
    const fixed = await s.adapter.fixHoloScript(code, errors);

    // Parse fixed code
    const fixedParseResult = this.validate(fixed.holoScript);

    return {
      holoScript: fixed.holoScript,
      aiConfidence: 0.85,
      parseResult: fixedParseResult,
      wasFixed: true,
      attempts: 1,
    };
  }

  /**
   * Explain generated code
   */
  async explain(code: string, session?: GenerationSession): Promise<string> {
    const s = session || this.currentSession;
    if (!s) {
      throw new Error('No generation session created. Call createSession first.');
    }

    if (!s.adapter.explainHoloScript) {
      throw new Error(`Adapter "${s.adapter.name}" does not support explainHoloScript`);
    }
    const result = await s.adapter.explainHoloScript(code);
    return result.explanation;
  }

  /**
   * Multi-turn conversation for iterative code generation
   */
  async chat(
    message: string,
    session?: GenerationSession,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const s = session || this.currentSession;
    if (!s) {
      throw new Error('No generation session created. Call createSession first.');
    }

    if (!s.adapter.chat) {
      throw new Error(`Adapter "${s.adapter.name}" does not support chat`);
    }
    return s.adapter.chat(message, '', history);
  }

  /**
   * Get current generation session
   */
  getCurrentSession(): GenerationSession | undefined {
    return this.currentSession;
  }

  /**
   * Get generation history
   */
  getHistory(session?: GenerationSession): GenerationHistory[] {
    const s = session || this.currentSession;
    return s?.history || [];
  }

  /**
   * Clear history
   */
  clearHistory(session?: GenerationSession): void {
    const s = session || this.currentSession;
    if (s) {
      s.history = [];
    }
  }

  /**
   * Get statistics for a session
   */
  getStats(session?: GenerationSession) {
    const s = session || this.currentSession;
    if (!s) {
      return null;
    }

    const history = s.history;
    const successCount = history.filter((h) => h.generated.parseResult.success).length;
    const fixedCount = history.filter((h) => h.generated.wasFixed).length;
    const avgAttempts =
      history.length > 0
        ? history.reduce((sum, h) => sum + h.generated.attempts, 0) / history.length
        : 0;
    const avgConfidence =
      history.length > 0
        ? history.reduce((sum, h) => sum + h.generated.aiConfidence, 0) / history.length
        : 0;

    return {
      totalGenerations: history.length,
      successCount,
      fixedCount,
      avgAttempts,
      avgConfidence,
      successRate: history.length > 0 ? successCount / history.length : 0,
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get analytics metrics
   */
  getAnalytics() {
    return {
      aggregateMetrics: this.analytics.getAggregateMetrics(),
      adapterMetrics: this.analytics.getAllAdapterMetrics(),
      confidenceDistribution: this.analytics.getConfidenceDistribution(),
      responseTimeDistribution: this.analytics.getResponseTimeDistribution(),
      errorPatterns: this.analytics.getErrorPatterns(),
      recommendations: this.analytics.getRecommendations(),
    };
  }

  /**
   * Generate analytics report
   */
  generateReport() {
    return this.analytics.generateReport();
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Quick generation helper
 */
export async function generateHoloScript(
  prompt: string,
  adapter: AIAdapter,
  config?: Partial<GenerationConfig>
): Promise<GeneratedCode> {
  const generator = new HoloScriptGenerator();
  const session = generator.createSession(adapter, config);
  return generator.generate(prompt, session);
}

/**
 * Batch generation helper
 */
export async function generateBatch(
  prompts: string[],
  adapter: AIAdapter,
  config?: Partial<GenerationConfig>
): Promise<GeneratedCode[]> {
  const generator = new HoloScriptGenerator();
  const session = generator.createSession(adapter, config);

  const results: GeneratedCode[] = [];
  for (const prompt of prompts) {
    results.push(await generator.generate(prompt, session));
  }

  return results;
}

/**
 * Validate batch of generated code
 */
export function validateBatch(
  codes: string[]
): Array<{ code: string; valid: boolean; errors: number }> {
  const parser = new HoloCompositionParser({ tolerant: false });

  return codes.map((code) => {
    const result = validateHoloScript(code, parser);
    return {
      code,
      valid: result.success,
      errors: result.errors.length,
    };
  });
}
