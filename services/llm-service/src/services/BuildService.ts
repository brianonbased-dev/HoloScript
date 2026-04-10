/**
 * Build generation service - converts prompts to HoloScript code
 */

import { StorageService, StoredBuild } from './StorageService';
import { OllamaService } from './OllamaService';
import { v4 as uuid } from 'uuid';
import { logger } from '../utils/logger';

export interface GenerateOptions {
  context: string;
  model?: string;
  userId: string;
}

export interface GeneratedCode {
  success: boolean;
  code: string;
  description: string;
  variables?: Record<string, string>;
  raw?: any;
  error?: string;
}

export class BuildService {
  private storage: StorageService;
  private ollama: OllamaService;

  constructor(storage: StorageService, ollama: OllamaService) {
    this.storage = storage;
    this.ollama = ollama;
  }

  async generateFromPrompt(prompt: string, options: GenerateOptions): Promise<GeneratedCode> {
    try {
      logger.info(
        `[BuildService] Generating for user ${options.userId}: ${prompt.slice(0, 50)}...`
      );

      // Create system prompt for HoloScript generation
      const systemPrompt = `You are a HoloScript code generator. 
Generate valid HoloScript code based on user descriptions.
Only output the HoloScript code, no explanations.
Use proper syntax with shape, animation, and positioning blocks.`;

      // Generate code via Ollama
      const fullPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;
      const generatedText = await this.ollama.generate(fullPrompt, options.context);

      // Parse and validate
      const code = this.extractHoloScript(generatedText);
      const description = this.extractDescription(prompt);

      return {
        success: !!code,
        code,
        description,
        variables: this.extractVariables(code),
      };
    } catch (error) {
      logger.error('[BuildService] Generation error:', error);
      return {
        success: false,
        code: '',
        description: 'Generation failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async saveBuild(
    userId: string,
    data: { name: string; code: string; description?: string }
  ): Promise<StoredBuild> {
    return this.storage.saveBuild(userId, {
      userId,
      ...data,
    });
  }

  async getBuild(id: string, userId: string): Promise<StoredBuild | null> {
    return this.storage.getBuild(id, userId);
  }

  async getBuildsByUser(userId: string): Promise<StoredBuild[]> {
    return this.storage.getBuildsByUser(userId);
  }

  async deleteBuild(id: string, userId: string): Promise<boolean> {
    return this.storage.deleteBuild(id, userId);
  }

  private extractHoloScript(text: string): string {
    // Try to extract code blocks
    let code = text;

    // Remove markdown code blocks
    code = code.replace(/```holoscript\n?([\s\S]*?)\n?```/g, '$1');
    code = code.replace(/```\n?([\s\S]*?)\n?```/g, '$1');

    // Remove explanatory text
    const programMatch = code.match(/program\s+\w+\s*\{[\s\S]*\}/);
    if (programMatch) {
      code = programMatch[0];
    }

    return code.trim();
  }

  private extractDescription(prompt: string): string {
    return prompt.split(/[.!?]/)[0].trim().slice(0, 100);
  }

  private extractVariables(code: string): Record<string, string> {
    const variables: Record<string, string> = {};

    // Simple variable extraction
    const varMatches = code.matchAll(/let\s+(\w+)\s*=\s*"([^"]*)"/g);
    for (const match of varMatches) {
      variables[match[1]] = match[2];
    }

    return variables;
  }
}
