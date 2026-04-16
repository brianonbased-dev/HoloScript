/**
 * CopilotPanel.ts
 *
 * Editor UI panel for AI Copilot interaction.
 * Provides a chat interface and quick action buttons.
 *
 * @module editor
 */

import { AICopilot, type CopilotResponse, type CopilotSuggestion } from '@holoscript/framework/ai';

// =============================================================================
// TYPES
// =============================================================================

export interface CopilotPanelConfig {
  position: [number, number, number];
  width: number;
  height: number;
  maxMessages: number;
}

export interface CopilotUIEntity {
  id: string;
  type: 'panel' | 'label' | 'button' | 'input' | 'message';
  position: [number, number, number];
  size?: { width: number; height: number };
  text?: string;
  color?: string;
  data?: Record<string, unknown>;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  suggestions?: CopilotSuggestion[];
}

const DEFAULT_CONFIG: CopilotPanelConfig = {
  position: [0.8, 1.5, -1],
  width: 0.6,
  height: 0.8,
  maxMessages: 20,
};

const USER_ICON = '\u{1F464}';
const ASSISTANT_ICON = '\u{1F916}';

// =============================================================================
// COPILOT PANEL
// =============================================================================

export class CopilotPanel {
  private config: CopilotPanelConfig;
  private copilot: AICopilot;
  private messages: DisplayMessage[] = [];
  private inputText: string = '';
  private isSending: boolean = false;

  constructor(copilot: AICopilot, config: Partial<CopilotPanelConfig> = {}) {
    this.copilot = copilot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // UI Generation
  // ---------------------------------------------------------------------------

  generateUI(): CopilotUIEntity[] {
    const entities: CopilotUIEntity[] = [];
    const { position, width, height } = this.config;
    const [x, y, z] = position;

    // Background panel
    entities.push({
      id: 'copilot_bg',
      type: 'panel',
      position: [...position],
      size: { width, height },
      color: '#0f0f23',
      data: { role: 'background' },
    });

    // Title bar
    entities.push({
      id: 'copilot_title',
      type: 'label',
      position: [x, y + height * 0.45, z + 0.001],
      text: `${ASSISTANT_ICON} AI Copilot`,
      color: '#00d4ff',
      data: { role: 'title' },
    });

    // Message display area
    const messageAreaTop = y + height * 0.35;
    const messageLineHeight = 0.035;
    const visibleMessages = this.messages.slice(-this.config.maxMessages);

    visibleMessages.forEach((msg, i) => {
      const yPos = messageAreaTop - i * messageLineHeight;
      entities.push({
        id: `copilot_msg_${i}`,
        type: 'message',
        position: [x, yPos, z + 0.001],
        text: `${msg.role === 'user' ? USER_ICON : ASSISTANT_ICON} ${msg.text}`,
        color: msg.role === 'user' ? '#e0e0e0' : '#00d4ff',
        data: { role: 'message', messageIndex: i },
      });
    });

    // Input field
    entities.push({
      id: 'copilot_input',
      type: 'input',
      position: [x, y - height * 0.35, z + 0.001],
      size: { width: width * 0.7, height: 0.04 },
      text: this.inputText || 'Type a prompt...',
      color: '#1a1a3e',
      data: { role: 'input' },
    });

    // Quick action buttons
    const buttonConfigs = [
      { id: 'btn_suggest', text: '\u{1F4A1} Suggest', action: 'suggest' },
      { id: 'btn_explain', text: '\u{1F4D6} Explain', action: 'explain' },
      { id: 'btn_fix', text: '\u{1F527} Fix', action: 'fix' },
    ];

    buttonConfigs.forEach((btn, i) => {
      entities.push({
        id: `copilot_${btn.id}`,
        type: 'button',
        position: [x - width * 0.3 + i * (width * 0.3), y - height * 0.45, z + 0.001,],
        size: { width: width * 0.25, height: 0.035 },
        text: btn.text,
        color: '#16213e',
        data: { role: 'action_button', action: btn.action },
      });
    });

    return entities;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }
    return 'Unknown error';
  }

  private buildErrorResponse(message: string): CopilotResponse {
    return {
      text: `I hit an issue while processing your request: ${message}`,
      suggestions: [],
      error: message,
    };
  }

  async sendMessage(text: string): Promise<CopilotResponse> {
    if (this.isSending) {
      return {
        text: 'Copilot is already processing a request. Please wait a moment.',
        suggestions: [],
        error: 'BUSY',
      };
    }

    const prompt = text.trim();
    if (!prompt) {
      return {
        text: 'Please enter a prompt before sending.',
        suggestions: [],
        error: 'EMPTY_PROMPT',
      };
    }

    this.inputText = '';
    this.messages.push({ role: 'user', text: prompt });
    this.isSending = true;

    let response: CopilotResponse;
    try {
      response = await this.copilot.generateFromPrompt(prompt);
    } catch (error) {
      response = this.buildErrorResponse(this.toErrorMessage(error));
    } finally {
      this.isSending = false;
    }

    this.messages.push({
      role: 'assistant',
      text: response.text,
      suggestions: response.suggestions,
    });

    // Trim history
    if (this.messages.length > this.config.maxMessages * 2) {
      this.messages = this.messages.slice(-this.config.maxMessages);
    }

    return response;
  }

  async requestSuggestion(): Promise<CopilotResponse> {
    let response: CopilotResponse;
    try {
      response = await this.copilot.suggestFromSelection();
    } catch (error) {
      response = this.buildErrorResponse(this.toErrorMessage(error));
    }

    this.messages.push({
      role: 'assistant',
      text: response.text,
      suggestions: response.suggestions,
    });

    // Keep suggestion-only flows bounded too
    if (this.messages.length > this.config.maxMessages * 2) {
      this.messages = this.messages.slice(-this.config.maxMessages);
    }

    return response;
  }

  setInputText(text: string): void {
    this.inputText = text;
  }

  getMessages(): DisplayMessage[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }
}
