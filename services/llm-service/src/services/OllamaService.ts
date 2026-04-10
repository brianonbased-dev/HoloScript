/**
 * Ollama inference service
 */

import { logger } from '../utils/logger';

export interface OllamaStatus {
  available: boolean;
  model?: string;
  baseUrl: string;
  lastChecked: string;
}

export class OllamaService {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async getStatus(): Promise<OllamaStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
      } as RequestInit);

      if (!response.ok) {
        return {
          available: false,
          baseUrl: this.baseUrl,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        available: true,
        model: this.model,
        baseUrl: this.baseUrl,
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn(
        'Ollama status check failed:',
        error instanceof Error ? error.message : String(error)
      );
      return {
        available: false,
        baseUrl: this.baseUrl,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        timeout: 5000,
      } as RequestInit);

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as any;
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  async generate(prompt: string, context?: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
        timeout: 120_000,
      } as RequestInit);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as any;
      return data.response || '';
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`[OllamaService] Generation failed: ${msg}`);
    }
  }
}
