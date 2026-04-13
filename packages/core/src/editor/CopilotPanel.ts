/**
 * CopilotPanel.ts
 *
 * Editor UI panel for AI Copilot interaction.
 * Provides a chat interface and quick action buttons.
 *
 * @module editor
 */

// @ts-expect-error
import { AICopilot, CopilotResponse, CopilotSuggestion } from '@holoscript/framework/ai';

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

// =============================================================================
// COPILOT PANEL
// =============================================================================

export class CopilotPanel {
  private config: CopilotPanelConfig;
  private copilot: AICopilot;
  private messages: DisplayMessage[] = [];
  private inputText: string = '';

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

    // Background panel
    entities.push({
      id: 'copilot_bg',
      type: 'panel',
      position: { ...position },
      size: { width, height },
      color: '#0f0f23',
      data: { role: 'background' },
    });

    // Title bar
    entities.push({
      id: 'copilot_title',
      type: 'label',
      position: [position.x, position.y + height * 0.45, position.z + 0.001],
      text: 'ðŸ¤– AI Copilot',
      color: '#00d4ff',
      data: { role: 'title' },
    });

    // Message display area
    const messageAreaTop = position.y + height * 0.35;
    const messageLineHeight = 0.035;
    const visibleMessages = this.messages.slice(-this.config.maxMessages);

    visibleMessages.forEach((msg, i) => {
      const yPos = messageAreaTop - i * messageLineHeight;
      entities.push({
        id: `copilot_msg_${i}`,
        type: 'message',
        position: [position.x, yPos, position.z + 0.001],
        text: `${msg.role === 'user' ? 'ðŸ‘¤' : 'ðŸ¤–'} ${msg.text}`,
        color: msg.role === 'user' ? '#e0e0e0' : '#00d4ff',
        data: { role: 'message', messageIndex: i },
      });
    });

    // Input field
    entities.push({
      id: 'copilot_input',
      type: 'input',
      position: [position.x, position.y - height * 0.35, position.z + 0.001],
      size: { width: width * 0.7, height: 0.04 },
      text: this.inputText || 'Type a prompt...',
      color: '#1a1a3e',
      data: { role: 'input' },
    });

    // Quick action buttons
    const buttonConfigs = [
      { id: 'btn_suggest', text: 'ðŸ’¡ Suggest', action: 'suggest' },
      { id: 'btn_explain', text: 'ðŸ“– Explain', action: 'explain' },
      { id: 'btn_fix', text: 'ðŸ”§ Fix', action: 'fix' },
    ];

    buttonConfigs.forEach((btn, i) => {
      entities.push({
        id: `copilot_${btn.id}`,
        type: 'button',
        position: [position.x - width * 0.3 + i * (width * 0.3), position.y - height * 0.45, position.z + 0.001,],
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

  async sendMessage(text: string): Promise<CopilotResponse> {
    this.inputText = '';
    this.messages.push({ role: 'user', text });

    const response = await this.copilot.generateFromPrompt(text);

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
    const response = await this.copilot.suggestFromSelection();
    this.messages.push({
      role: 'assistant',
      text: response.text,
      suggestions: response.suggestions,
    });
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
