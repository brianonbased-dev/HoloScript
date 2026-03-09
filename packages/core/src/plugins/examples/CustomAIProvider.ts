/**
 * CustomAIProvider — Example custom AI provider for StoryWeaver
 *
 * Demonstrates how to implement a custom AI provider that integrates with
 * any LLM API (Anthropic Claude, OpenAI GPT, Cohere, Mistral, Llama, etc.)
 *
 * @version 1.0.0
 * @example Example plugin implementation
 */

import { BaseAIProvider, type AIProviderConfig } from '../HololandExtensionPoint';
import type { AIGeneratedNarrative, AIGeneratedQuest } from '../HololandTypes';

/**
 * Custom AI provider implementation
 *
 * This example uses a generic API endpoint that accepts:
 * ```json
 * {
 *   "model": "model-name",
 *   "messages": [{"role": "user", "content": "prompt"}],
 *   "temperature": 0.7,
 *   "max_tokens": 1000
 * }
 * ```
 *
 * @example Usage
 * ```typescript
 * import { CustomAIProvider } from '@holoscript/plugin-custom-ai';
 * import { getHololandRegistry } from '@holoscript/core';
 *
 * const provider = new CustomAIProvider();
 * await provider.initialize({
 *   providerId: 'custom-llm',
 *   displayName: 'Custom LLM',
 *   apiKey: 'your-api-key',
 *   model: 'custom-model-name',
 *   temperature: 0.8,
 *   maxTokens: 2000,
 *   apiEndpoint: 'https://api.example.com/v1/chat/completions'
 * });
 *
 * const registry = getHololandRegistry();
 * registry.registerAIProvider(provider);
 *
 * // Generate narrative
 * const narrative = await provider.generateNarrative(
 *   'Create an immersive intro for a cyberpunk world',
 *   'cyberpunk'
 * );
 * ```
 */
export class CustomAIProvider extends BaseAIProvider {
  readonly id = 'custom-ai';
  private apiEndpoint?: string;

  /**
   * Initialize the AI provider
   */
  async initialize(config: AIProviderConfig & { apiEndpoint?: string }): Promise<void> {
    await super.initialize(config);
    this.apiEndpoint = config.apiEndpoint || 'https://api.example.com/v1/chat/completions';
    console.log('[CustomAIProvider] Initialized with endpoint:', this.apiEndpoint);
  }

  /**
   * Generate narrative content
   */
  async generateNarrative(prompt: string, theme: string): Promise<AIGeneratedNarrative> {
    if (!this.config?.apiKey) {
      throw new Error('API key not configured');
    }

    try {
      const systemPrompt = `You are a creative narrative writer for immersive VR/AR experiences. Generate engaging, atmospheric narratives that set the scene and draw users into the world.`;

      const userPrompt = `Theme: ${theme}\n\nTask: ${prompt}\n\nGenerate a compelling narrative (200-300 words) that creates atmosphere and engages the user.`;

      const response = await fetch(this.apiEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'default-model',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: this.config.temperature || 0.7,
          max_tokens: this.config.maxTokens || 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content || '';
      const tokensUsed = data.usage?.total_tokens || 0;

      // Update usage statistics
      this.updateStats(tokensUsed, this.estimateCost(tokensUsed));

      const narrative: AIGeneratedNarrative = {
        text,
        theme,
        genre: this.detectGenre(theme),
        wordCount: text.split(/\s+/).length,
        generatedAt: Date.now(),
        provider: this.id,
        model: this.config.model || 'unknown',
        prompt: userPrompt,
      };

      console.log(`[CustomAIProvider] Generated narrative: ${narrative.wordCount} words`);
      return narrative;
    } catch (error) {
      console.error('[CustomAIProvider] Error generating narrative:', error);
      throw error;
    }
  }

  /**
   * Generate quest content
   */
  async generateQuest(businessId: string, theme: string): Promise<AIGeneratedQuest> {
    if (!this.config?.apiKey) {
      throw new Error('API key not configured');
    }

    try {
      const systemPrompt = `You are a quest designer for location-based AR/VR experiences. Create engaging quests that blend real-world locations with virtual objectives.`;

      const userPrompt = `Business ID: ${businessId}\nTheme: ${theme}\n\nCreate a quest that:\n1. Has a compelling narrative\n2. Includes 3-4 clear objectives\n3. Offers meaningful rewards\n4. Takes 10-20 minutes to complete\n\nFormat your response as JSON with: title, description, narrative, objectives (array), rewards (array), difficulty, estimatedDuration.`;

      const response = await fetch(this.apiEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'default-model',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: this.config.temperature || 0.8,
          max_tokens: this.config.maxTokens || 1500,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content || '';
      const tokensUsed = data.usage?.total_tokens || 0;

      // Update usage statistics
      this.updateStats(tokensUsed, this.estimateCost(tokensUsed));

      // Parse AI response into quest structure
      const quest = this.parseQuestFromText(text, businessId, theme);

      console.log(`[CustomAIProvider] Generated quest: ${quest.title}`);
      return quest;
    } catch (error) {
      console.error('[CustomAIProvider] Error generating quest:', error);
      throw error;
    }
  }

  /**
   * Check if provider is available
   */
  async checkAvailability(): Promise<boolean> {
    if (!this.config?.apiKey || !this.apiEndpoint) {
      return false;
    }

    try {
      // Send a minimal request to check connectivity
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'default-model',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
      });

      return response.ok || response.status === 401; // 401 means auth failed but API is reachable
    } catch {
      return false;
    }
  }

  /**
   * Detect genre from theme
   */
  private detectGenre(theme: string): string {
    const t = theme.toLowerCase();
    if (t.includes('sci-fi') || t.includes('space') || t.includes('cyberpunk')) return 'sci-fi';
    if (t.includes('fantasy') || t.includes('magic') || t.includes('medieval')) return 'fantasy';
    if (t.includes('horror') || t.includes('scary') || t.includes('dark')) return 'horror';
    if (t.includes('mystery') || t.includes('detective')) return 'mystery';
    if (t.includes('adventure') || t.includes('explore')) return 'adventure';
    return 'general';
  }

  /**
   * Parse AI-generated text into quest structure
   */
  private parseQuestFromText(text: string, businessId: string, theme: string): AIGeneratedQuest {
    // Try to parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: `quest_${Date.now()}`,
          ...parsed,
          theme,
        };
      }
    } catch {
      // If JSON parsing fails, create quest from text
    }

    // Fallback: create basic quest structure
    return {
      id: `quest_${Date.now()}`,
      title: `${theme} Adventure`,
      description: `An exciting quest themed around ${theme}`,
      narrative: text,
      objectives: [
        {
          id: 'obj1',
          type: 'location',
          description: 'Visit the location',
          targetValue: 1,
          required: true,
        },
        {
          id: 'obj2',
          type: 'interact',
          description: 'Complete the interaction',
          targetValue: 1,
          required: true,
        },
      ],
      rewards: [{ type: 'xp', value: 100, description: '100 XP' }],
      difficulty: 'medium',
      estimatedDuration: 15,
      theme,
    };
  }

  /**
   * Estimate cost based on tokens (override for your pricing)
   */
  private estimateCost(tokens: number): number {
    // Example: $0.01 per 1K tokens
    return (tokens / 1000) * 0.01;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    super.dispose();
    console.log('[CustomAIProvider] Disposed');
  }
}

/**
 * Plugin manifest for Custom AI provider
 */
export const customAIPluginManifest = {
  id: 'holoscript-custom-ai',
  name: 'Custom AI Provider',
  version: '1.0.0',
  description: 'Custom AI provider for StoryWeaver narrative generation',
  author: 'HoloScript Community',
  license: 'MIT',
  main: 'CustomAIProvider.js',
  permissions: ['storyweaver:ai'] as const,
  hololandFeatures: {
    aiProviders: [
      {
        id: 'custom-ai',
        displayName: 'Custom LLM',
        description: 'Flexible AI provider for any LLM API',
        className: 'CustomAIProvider',
        features: {
          narrativeGeneration: true,
          questGeneration: true,
          dialogueGeneration: true,
        },
        configSchema: {
          type: 'object',
          properties: {
            apiKey: {
              type: 'string',
              description: 'API key for authentication',
            },
            apiEndpoint: {
              type: 'string',
              description: 'API endpoint URL',
              default: 'https://api.example.com/v1/chat/completions',
            },
            model: {
              type: 'string',
              description: 'Model identifier',
            },
            temperature: {
              type: 'number',
              default: 0.7,
              minimum: 0,
              maximum: 2,
            },
            maxTokens: {
              type: 'number',
              default: 1000,
            },
          },
          required: ['apiKey'],
        },
      },
    ],
  },
};
