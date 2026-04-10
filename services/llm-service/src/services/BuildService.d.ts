/**
 * Build generation service - converts prompts to HoloScript code
 */
import { StorageService, StoredBuild } from './StorageService';
import { OllamaService } from './OllamaService';
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
export declare class BuildService {
    private storage;
    private ollama;
    constructor(storage: StorageService, ollama: OllamaService);
    generateFromPrompt(prompt: string, options: GenerateOptions): Promise<GeneratedCode>;
    saveBuild(userId: string, data: {
        name: string;
        code: string;
        description?: string;
    }): Promise<StoredBuild>;
    getBuild(id: string, userId: string): Promise<StoredBuild | null>;
    getBuildsByUser(userId: string): Promise<StoredBuild[]>;
    deleteBuild(id: string, userId: string): Promise<boolean>;
    private extractHoloScript;
    private extractDescription;
    private extractVariables;
}
