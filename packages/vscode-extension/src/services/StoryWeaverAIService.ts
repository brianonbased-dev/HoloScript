/**
 * StoryWeaverAIService — AI-powered narrative and quest generation
 *
 * Integrates with LLM providers (OpenAI, Anthropic, Gemini) to generate
 * immersive narratives, quests, and NPC dialogue for VR/AR experiences.
 *
 * @version 1.0.0
 */

import * as vscode from 'vscode';
import type {
  AIGeneratedNarrative,
  AIGeneratedQuest,
  StoryWeaverConfig,
} from '../../../core/src/plugins/HololandTypes';

export class StoryWeaverAIService {
  private config: StoryWeaverConfig;
  private outputChannel: vscode.OutputChannel;
  private generationHistory: AIGeneratedNarrative[] = [];

  constructor(config?: Partial<StoryWeaverConfig>) {
    this.config = {
      provider: config?.provider ?? 'openai',
      model: config?.model,
      apiKey: config?.apiKey,
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 1000,
    };
    this.outputChannel = vscode.window.createOutputChannel('StoryWeaver AI');
  }

  /**
   * Generate AI narrative
   */
  async generateNarrative(prompt: string, theme: string): Promise<string> {
    this.outputChannel.appendLine(`Generating narrative for theme: ${theme}`);
    this.outputChannel.appendLine(`Prompt: ${prompt}`);

    // Check if API key is configured (in simulation mode, this is optional)
    if (!this.config.apiKey && !this.isSimulationMode()) {
      const configure = await vscode.window.showWarningMessage(
        `StoryWeaver AI: ${this.config.provider} API key not configured`,
        'Configure Now',
        'Use Mock'
      );

      if (configure === 'Configure Now') {
        await this.promptForAPIKey();
      }
    }

    const narrative = this.isSimulationMode()
      ? await this.generateMockNarrative(prompt, theme)
      : await this.generateRealNarrative(prompt, theme);

    // Record in history
    this.generationHistory.push(narrative);

    return narrative.text;
  }

  /**
   * Generate AI quest
   */
  async generateQuest(businessId: string, theme: string): Promise<AIGeneratedQuest> {
    this.outputChannel.appendLine(`Generating quest for business: ${businessId}`);
    this.outputChannel.appendLine(`Theme: ${theme}`);

    const prompt = `Create an engaging quest for a business with theme: ${theme}. Include objectives and rewards.`;

    const narrative = this.isSimulationMode()
      ? await this.generateMockNarrative(prompt, theme)
      : await this.generateRealNarrative(prompt, theme);

    // Parse narrative into quest structure
    const quest: AIGeneratedQuest = {
      id: `quest_${Date.now()}`,
      title: `${theme} Adventure`,
      description: `An exciting quest themed around ${theme}`,
      narrative: narrative.text,
      objectives: [
        {
          id: 'obj1',
          type: 'location',
          description: 'Visit the designated location',
          targetValue: 1,
          required: true,
        },
        {
          id: 'obj2',
          type: 'interact',
          description: 'Interact with the quest giver',
          targetValue: 1,
          required: true,
        },
        {
          id: 'obj3',
          type: 'collect',
          description: 'Collect the special item',
          targetValue: 1,
          required: false,
        },
      ],
      rewards: [
        { type: 'xp', value: 100, description: '100 XP' },
        { type: 'coupon', value: '10% off', description: '10% discount coupon' },
      ],
      difficulty: 'medium',
      estimatedDuration: 15,
      theme,
    };

    this.outputChannel.appendLine(`✅ Quest generated: ${quest.title}`);

    return quest;
  }

  /**
   * Generate mock narrative (for development)
   */
  private async generateMockNarrative(
    prompt: string,
    theme: string
  ): Promise<AIGeneratedNarrative> {
    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating narrative...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 30, message: 'Thinking...' });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        progress.report({ increment: 70, message: 'Writing...' });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    );

    const narrative: AIGeneratedNarrative = {
      text: `Welcome to the world of ${theme}! This is an AI-generated narrative that sets the stage for an immersive experience. In this adventure, you'll discover hidden secrets, meet interesting characters, and uncover the mysteries that lie within. The journey begins here, and every choice you make will shape your destiny. Are you ready to embark on this quest?\n\nAs you step into this realm, the atmosphere shifts around you. The ${theme.toLowerCase()} theme permeates every aspect of your surroundings, creating a unique and engaging environment. Your mission, should you choose to accept it, will challenge your wits and reward your perseverance.`,
      theme,
      genre: 'adventure',
      wordCount: 120,
      generatedAt: Date.now(),
      provider: this.config.provider,
      model: this.config.model || 'mock-model',
      prompt,
    };

    return narrative;
  }

  /**
   * Generate real narrative via LLM provider
   */
  private async generateRealNarrative(
    prompt: string,
    theme: string
  ): Promise<AIGeneratedNarrative> {
    // TODO: Integrate with real LLM providers
    // - OpenAI: Use @holoscript/llm-provider package
    // - Anthropic: Use @holoscript/llm-provider package
    // - Gemini: Use @holoscript/llm-provider package

    throw new Error(
      `Real ${this.config.provider} integration not yet implemented. Using mock generation.`
    );
  }

  /**
   * Prompt user for API key
   */
  private async promptForAPIKey(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
      prompt: `Enter your ${this.config.provider} API key`,
      password: true,
      placeHolder: 'sk-...',
    });

    if (apiKey) {
      this.config.apiKey = apiKey;
      // Save to workspace settings
      const config = vscode.workspace.getConfiguration('holoscript.storyweaver');
      await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Workspace);
      vscode.window.showInformationMessage('API key saved');
    }
  }

  /**
   * Check if in simulation mode (no API key = simulation)
   */
  private isSimulationMode(): boolean {
    return !this.config.apiKey;
  }

  /**
   * Get generation history
   */
  getHistory(limit?: number): AIGeneratedNarrative[] {
    return limit ? this.generationHistory.slice(-limit) : [...this.generationHistory];
  }

  /**
   * Get total words generated
   */
  getTotalWordsGenerated(): number {
    return this.generationHistory.reduce((sum, n) => sum + n.wordCount, 0);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StoryWeaverConfig>): void {
    this.config = { ...this.config, ...config };
    this.outputChannel.appendLine(
      `Config updated: provider=${this.config.provider}, model=${this.config.model}`
    );
  }

  /**
   * Get current configuration
   */
  getConfig(): StoryWeaverConfig {
    return { ...this.config };
  }

  /**
   * Clear generation history
   */
  clearHistory(): void {
    this.generationHistory = [];
    this.outputChannel.appendLine('Generation history cleared');
  }

  /**
   * Export generation history
   */
  exportHistory(): string {
    return JSON.stringify(this.generationHistory, null, 2);
  }

  /**
   * Dispose of service resources
   */
  dispose(): void {
    this.generationHistory = [];
    this.outputChannel.dispose();
  }
}
