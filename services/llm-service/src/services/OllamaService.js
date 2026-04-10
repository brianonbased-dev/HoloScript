/**
 * Ollama inference service
 */
import { logger } from '../utils/logger';
export class OllamaService {
    constructor(baseUrl, model) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.model = model;
    }
    async getStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                timeout: 5000,
            });
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
        }
        catch (error) {
            logger.warn('Ollama status check failed:', error instanceof Error ? error.message : String(error));
            return {
                available: false,
                baseUrl: this.baseUrl,
                lastChecked: new Date().toISOString(),
            };
        }
    }
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                timeout: 5000,
            });
            if (!response.ok) {
                return [];
            }
            const data = (await response.json());
            return (data.models || []).map((m) => m.name);
        }
        catch {
            return [];
        }
    }
    async generate(prompt, context) {
        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt,
                    stream: false,
                }),
                timeout: 120000,
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = (await response.json());
            return data.response || '';
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`[OllamaService] Generation failed: ${msg}`);
        }
    }
}
