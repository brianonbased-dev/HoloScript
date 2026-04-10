/**
 * Mock LLM Provider Adapter
 *
 * A fully functional mock adapter for testing HoloScript applications
 * without real API calls. Returns deterministic responses based on
 * the input prompt.
 *
 * @version 1.0.0
 */

import { BaseLLMAdapter } from '../base-adapter';
import type { LLMCompletionRequest, LLMCompletionResponse, LLMProviderConfig } from '../types';

const MOCK_SCENES: Record<string, string> = {
  default: `cube {
  @color(red)
  @position(0, 1, 0)
  @grabbable
  @physics
}`,
  island: `scene {
  plane {
    @color(green)
    @position(0, 0, 0)
    @scale(20, 0.5, 20)
    @static
    @collidable
  }

  sphere {
    @color(cyan)
    @position(0, 2, 0)
    @emissive(cyan)
    @scale(0.5, 0.5, 0.5)
    @hoverable
  }

  cylinder {
    @color(brown)
    @position(3, 1, 0)
    @grabbable
    @physics
  }
}`,
  robot: `scene {
  cube {
    @color(silver)
    @position(0, 1, 0)
    @scale(0.8, 1.2, 0.8)
    @physics
    @collidable
  }

  sphere {
    @color(silver)
    @position(0, 2.2, 0)
    @scale(0.6, 0.6, 0.6)
    @physics
  }
}`,
  space: `scene {
  sphere {
    @color(blue)
    @position(0, 3, 0)
    @scale(2, 2, 2)
    @emissive(blue)
    @hoverable
  }

  sphere {
    @color(gray)
    @position(5, 2, 0)
    @scale(0.5, 0.5, 0.5)
  }
}`,
};

/**
 * Mock LLM provider for testing - no API calls, no cost.
 *
 * @example
 * ```typescript
 * // Use in tests
 * const mock = new MockAdapter();
 * const scene = await mock.generateHoloScript({ prompt: "a floating island" });
 * expect(scene.valid).toBe(true);
 * ```
 */
export class MockAdapter extends BaseLLMAdapter {
  readonly name = 'mock' as const;
  readonly models = ['mock-gpt-4', 'mock-claude', 'mock-gemini'] as const;
  readonly defaultHoloScriptModel = 'mock-gpt-4';

  /** Number of complete() calls made */
  callCount = 0;

  /** Whether the next call should fail (for testing error handling) */
  failOnNextCall = false;

  /** Simulated latency in ms */
  simulatedLatencyMs = 0;

  constructor(config: Partial<LLMProviderConfig> = {}) {
    super({
      apiKey: config.apiKey ?? 'mock-key',
      timeoutMs: config.timeoutMs ?? 5000,
      maxRetries: config.maxRetries ?? 1,
      defaultModel: config.defaultModel,
    });
  }

  protected getDefaultModel(): string {
    return 'mock-gpt-4';
  }

  async complete(request: LLMCompletionRequest, _model?: string): Promise<LLMCompletionResponse> {
    this.callCount++;

    if (this.simulatedLatencyMs > 0) {
      await this.sleep(this.simulatedLatencyMs);
    }

    if (this.failOnNextCall) {
      this.failOnNextCall = false;
      throw new Error('Mock forced failure');
    }

    const lastUserMessage =
      [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    const code = this.generateMockCode(lastUserMessage);

    const promptTokens = Math.floor(
      request.messages.reduce((acc, m) => acc + m.content.length / 4, 0)
    );
    const completionTokens = Math.floor(code.length / 4);

    return {
      content: code,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      model: 'mock-gpt-4',
      provider: 'mock',
      finishReason: 'stop',
    };
  }

  /**
   * Override healthCheck to always succeed instantly.
   */
  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    return { ok: true, latencyMs: this.simulatedLatencyMs };
  }

  /** Reset call counter and state. */
  reset(): void {
    this.callCount = 0;
    this.failOnNextCall = false;
    this.simulatedLatencyMs = 0;
  }

  private generateMockCode(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (lower.includes('island') || lower.includes('terrain') || lower.includes('ground')) {
      return MOCK_SCENES.island;
    }
    if (lower.includes('robot') || lower.includes('humanoid') || lower.includes('android')) {
      return MOCK_SCENES.robot;
    }
    if (lower.includes('space') || lower.includes('planet') || lower.includes('star')) {
      return MOCK_SCENES.space;
    }

    return MOCK_SCENES.default;
  }
}
