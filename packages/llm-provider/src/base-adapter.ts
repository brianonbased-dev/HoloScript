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
  HoloScriptGenerationRequest,
  HoloScriptGenerationResponse,
  LLMProviderName,
  LLMProviderConfig,
  TokenUsage,
} from './types';
import { extractTraits } from '@holoscript/std';

// =============================================================================
// HoloScript Generation System Prompt
// =============================================================================

const HOLOSCRIPT_SYSTEM_PROMPT = `You are an expert HoloScript developer. HoloScript is a spatial computing language for VR/AR scenes.

HoloScript syntax:
- Objects: cube, sphere, plane, cylinder, cone, torus, mesh, text, light, camera
- Traits: @color(value), @position(x, y, z), @rotation(x, y, z), @scale(x, y, z)
- Interaction: @grabbable, @clickable, @hoverable, @throwable, @scalable
- Physics: @physics, @gravity, @collidable, @static, @kinematic
- Visual: @emissive(color), @transparent(opacity), @wireframe, @metallic(value)
- Network: @networked, @shared, @owned
- AI: @agent, @llm_agent, @reactive

Rules:
1. Return ONLY valid HoloScript code - no markdown, no explanations
2. Use realistic positions (objects should be visible, y >= 0 for floor level)
3. Group related objects logically
4. Keep scenes focused on the user's request
5. Use appropriate traits for the described behavior

Example:
cube {
  @color(red)
  @position(0, 1, 0)
  @grabbable
  @physics
}`;

// =============================================================================
// Trait extraction regex
// =============================================================================

const TRAIT_REGEX = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;

// =============================================================================
// Base Adapter
// =============================================================================

export abstract class BaseLLMAdapter implements ILLMProvider {
  abstract readonly name: LLMProviderName;
  abstract readonly models: readonly string[];
  abstract readonly defaultHoloScriptModel: string;

  protected readonly config: Required<LLMProviderConfig>;

  constructor(config: LLMProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? '',
      timeoutMs: config.timeoutMs ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      defaultModel: config.defaultModel ?? this.getDefaultModel(),
    };
  }

  protected abstract getDefaultModel(): string;

  abstract complete(request: LLMCompletionRequest, model?: string): Promise<LLMCompletionResponse>;

  /**
   * Generate HoloScript code from a natural language description.
   * Includes retry logic and validation.
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

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
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
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Don't retry authentication errors or context length errors
        if (err instanceof Error && err.name === 'LLMAuthenticationError') {
          throw err;
        }
        if (err instanceof Error && err.name === 'LLMContextLengthError') {
          throw err;
        }

        if (attempt < this.config.maxRetries - 1) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 8000);
          await this.sleep(delayMs);
        }
      }
    }

    throw (
      lastError ??
      new Error(`Failed to generate HoloScript after ${this.config.maxRetries} attempts`)
    );
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

    // Check for at least one object
    const objectMatch = code.match(
      /\b(cube|sphere|plane|cylinder|cone|torus|mesh|text|light|camera|scene)\s*\{/
    );
    if (!objectMatch) {
      errors.push('No recognized HoloScript object types found');
    }

    return { valid: errors.length === 0, errors };
  }



  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a zero-usage TokenUsage for mock/error cases.
   */
  protected zeroUsage(): TokenUsage {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }
}
