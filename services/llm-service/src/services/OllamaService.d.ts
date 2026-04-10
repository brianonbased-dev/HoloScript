/**
 * Ollama inference service
 */
export interface OllamaStatus {
    available: boolean;
    model?: string;
    baseUrl: string;
    lastChecked: string;
}
export declare class OllamaService {
    private baseUrl;
    private model;
    constructor(baseUrl: string, model: string);
    getStatus(): Promise<OllamaStatus>;
    listModels(): Promise<string[]>;
    generate(prompt: string, context?: string): Promise<string>;
}
