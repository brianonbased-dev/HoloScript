/**
 * Build generation service - converts prompts to HoloScript code
 */
import { logger } from '../utils/logger';
export class BuildService {
    constructor(storage, ollama) {
        this.storage = storage;
        this.ollama = ollama;
    }
    async generateFromPrompt(prompt, options) {
        try {
            logger.info(`[BuildService] Generating for user ${options.userId}: ${prompt.slice(0, 50)}...`);
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
        }
        catch (error) {
            logger.error('[BuildService] Generation error:', error);
            return {
                success: false,
                code: '',
                description: 'Generation failed',
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async saveBuild(userId, data) {
        return this.storage.saveBuild(userId, {
            userId,
            ...data,
        });
    }
    async getBuild(id, userId) {
        return this.storage.getBuild(id, userId);
    }
    async getBuildsByUser(userId) {
        return this.storage.getBuildsByUser(userId);
    }
    async deleteBuild(id, userId) {
        return this.storage.deleteBuild(id, userId);
    }
    extractHoloScript(text) {
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
    extractDescription(prompt) {
        return prompt.split(/[.!?]/)[0].trim().slice(0, 100);
    }
    extractVariables(code) {
        const variables = {};
        // Simple variable extraction
        const varMatches = code.matchAll(/let\s+(\w+)\s*=\s*"([^"]*)"/g);
        for (const match of varMatches) {
            variables[match[1]] = match[2];
        }
        return variables;
    }
}
