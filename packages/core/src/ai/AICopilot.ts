/**
 * AICopilot.ts
 *
 * Editor-aware AI assistant that bridges the existing AIAdapter/HoloScriptGenerator
 * infrastructure with the runtime and editor for real-time AI assistance.
 *
 * @module ai
 */

import { AIAdapter, GenerateOptions, GenerateResult } from './AIAdapter';
import { HoloScriptGenerator, GeneratedCode } from './HoloScriptGenerator';

// =============================================================================
// TYPES
// =============================================================================

export interface CopilotContext {
  /** Currently selected entity type/id */
  selectedEntity?: { id: string; type: string; properties?: Record<string, unknown> };
  /** Current scene node types */
  sceneNodeTypes?: string[];
  /** Active state keys */
  stateKeys?: string[];
  /** Recent user actions */
  recentActions?: string[];
}

export interface CopilotSuggestion {
  type: 'modify' | 'create' | 'explain' | 'fix';
  description: string;
  holoScript?: string;
  confidence: number;
}

export interface CopilotResponse {
  text: string;
  suggestions: CopilotSuggestion[];
  generatedCode?: GeneratedCode;
  error?: string;
}

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// =============================================================================
// AI COPILOT
// =============================================================================

export class AICopilot {
  private adapter: AIAdapter | null = null;
  private generator: HoloScriptGenerator;
  private history: CopilotMessage[] = [];
  private context: CopilotContext = {};

  constructor(adapter?: AIAdapter) {
    this.generator = new HoloScriptGenerator();
    if (adapter) {
      this.setAdapter(adapter);
    }
  }

  // ---------------------------------------------------------------------------
  // Adapter Management
  // ---------------------------------------------------------------------------

  setAdapter(adapter: AIAdapter): void {
    this.adapter = adapter;
    this.generator.createSession(adapter);
  }

  getAdapter(): AIAdapter | null {
    return this.adapter;
  }

  isReady(): boolean {
    return this.adapter !== null;
  }

  // ---------------------------------------------------------------------------
  // Context Management
  // ---------------------------------------------------------------------------

  updateContext(context: Partial<CopilotContext>): void {
    this.context = { ...this.context, ...context };
  }

  getContext(): CopilotContext {
    return { ...this.context };
  }

  // ---------------------------------------------------------------------------
  // Core Operations
  // ---------------------------------------------------------------------------

  /**
   * Generate HoloScript from a natural language prompt.
   * Uses the full HoloScriptGenerator pipeline (generate → validate → auto-fix).
   */
  async generateFromPrompt(
    prompt: string,
    options?: Partial<GenerateOptions>
  ): Promise<CopilotResponse> {
    const adapter = this.adapter;
    if (!adapter) {
      return {
        text: 'No AI adapter configured. Please set an adapter first.',
        suggestions: [],
        error: 'NO_ADAPTER',
      };
    }
    if (!adapter.generateHoloScript) {
      return { text: 'Adapter does not support generateHoloScript.', suggestions: [], error: 'UNSUPPORTED' };
    }

    this.addMessage('user', prompt);

    try {
      const result = await adapter.generateHoloScript(prompt, {
        targetPlatform: 'vr',
        includePhysics: true,
        ...options,
      });

      const response: CopilotResponse = {
        text: `Generated HoloScript with ${result.objectCount || 'unknown'} objects (confidence: ${((result.confidence || 0) * 100).toFixed(0)}%).`,
        suggestions: [{
          type: 'create',
          description: `Create scene from: "${prompt}"`,
          holoScript: result.holoScript,
          confidence: result.confidence || 0,
        }],
      };

      if (result.warnings?.length) {
        response.text += ` Warnings: ${result.warnings.join(', ')}`;
      }

      this.addMessage('assistant', response.text);
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.addMessage('assistant', `Error: ${errorMsg}`);
      return {
        text: `Generation failed: ${errorMsg}`,
        suggestions: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Suggest modifications for the currently selected entity.
   */
  async suggestFromSelection(): Promise<CopilotResponse> {
    const adapter = this.adapter;
    if (!adapter) {
      return { text: 'No adapter configured.', suggestions: [], error: 'NO_ADAPTER' };
    }
    if (!adapter.generateHoloScript) {
      return { text: 'Adapter does not support generateHoloScript.', suggestions: [], error: 'UNSUPPORTED' };
    }

    const entity = this.context.selectedEntity;
    if (!entity) {
      return {
        text: 'No entity selected. Select an entity in the editor first.',
        suggestions: [],
      };
    }

    const prompt = `Suggest improvements for a ${entity.type} entity with properties: ${JSON.stringify(entity.properties || {})}`;

    try {
      const result = await adapter.generateHoloScript(prompt, {
        style: 'modern',
        complexity: 'medium',
      });

      return {
        text: `Suggestions for ${entity.type} (${entity.id}):`,
        suggestions: [{
          type: 'modify',
          description: `Enhance ${entity.type} with AI suggestions`,
          holoScript: result.holoScript,
          confidence: result.confidence || 0,
        }],
      };
    } catch (error) {
      return {
        text: `Suggestion failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: [],
        error: String(error),
      };
    }
  }

  /**
   * Explain the current scene in natural language.
   */
  async explainScene(sceneCode: string): Promise<CopilotResponse> {
    const adapter = this.adapter;
    if (!adapter) {
      return { text: 'No adapter configured.', suggestions: [], error: 'NO_ADAPTER' };
    }
    if (!adapter.explainHoloScript) {
      return { text: 'Adapter does not support explainHoloScript.', suggestions: [], error: 'UNSUPPORTED' };
    }

    try {
      const result = await adapter.explainHoloScript(sceneCode);
      return {
        text: result.explanation,
        suggestions: [],
      };
    } catch (error) {
      return {
        text: `Explanation failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: [],
        error: String(error),
      };
    }
  }

  /**
   * Auto-fix runtime errors using the AI adapter.
   */
  async autoFix(code: string, errors: string[]): Promise<CopilotResponse> {
    const adapter = this.adapter;
    if (!adapter) {
      return { text: 'No adapter configured.', suggestions: [], error: 'NO_ADAPTER' };
    }
    if (!adapter.fixHoloScript) {
      return { text: 'Adapter does not support fixHoloScript.', suggestions: [], error: 'UNSUPPORTED' };
    }

    try {
      const result = await adapter.fixHoloScript(code, errors);
      return {
        text: `Fixed ${result.fixes.length} issue(s).`,
        suggestions: result.fixes.map(fix => ({
          type: 'fix' as const,
          description: `Line ${fix.line}: ${fix.issue} → ${fix.fix}`,
          holoScript: result.holoScript,
          confidence: 0.8,
        })),
      };
    } catch (error) {
      return {
        text: `Auto-fix failed: ${error instanceof Error ? error.message : String(error)}`,
        suggestions: [],
        error: String(error),
      };
    }
  }

  /**
   * Chat with the AI about HoloScript code (multi-turn conversation).
   */
  async chat(message: string): Promise<CopilotResponse> {
    const adapter = this.adapter;
    if (!adapter) {
      return { text: 'No adapter configured.', suggestions: [], error: 'NO_ADAPTER' };
    }
    if (!adapter.chat) {
      return { text: 'Adapter does not support chat.', suggestions: [], error: 'UNSUPPORTED' };
    }

    this.addMessage('user', message);

    try {
      const chatHistory = this.history.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await adapter.chat(message, undefined, chatHistory);
      this.addMessage('assistant', response);

      return {
        text: response,
        suggestions: [],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        text: `Chat failed: ${errorMsg}`,
        suggestions: [],
        error: errorMsg,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // History Management
  // ---------------------------------------------------------------------------

  getHistory(): CopilotMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.push({ role, content, timestamp: Date.now() });
  }
}
