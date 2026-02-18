import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopilotPanel } from '../CopilotPanel';

// Mock AICopilot
function createMockCopilot() {
  return {
    generateFromPrompt: vi.fn().mockResolvedValue({
      text: 'AI response',
      suggestions: [{ type: 'code', text: 'example()' }],
    }),
    suggestFromSelection: vi.fn().mockResolvedValue({
      text: 'Suggestion response',
      suggestions: [],
    }),
  } as any;
}

describe('CopilotPanel', () => {
  let copilot: ReturnType<typeof createMockCopilot>;
  let panel: CopilotPanel;

  beforeEach(() => {
    copilot = createMockCopilot();
    panel = new CopilotPanel(copilot);
  });

  it('starts with no messages', () => {
    expect(panel.getMessages()).toEqual([]);
  });

  it('generateUI returns entities', () => {
    const entities = panel.generateUI();
    expect(entities.length).toBeGreaterThan(0);
    const bg = entities.find(e => e.data?.role === 'background');
    expect(bg).toBeDefined();
  });

  it('generateUI includes title', () => {
    const entities = panel.generateUI();
    const title = entities.find(e => e.data?.role === 'title');
    expect(title).toBeDefined();
    expect(title!.text).toContain('Copilot');
  });

  it('generateUI includes action buttons', () => {
    const entities = panel.generateUI();
    const buttons = entities.filter(e => e.data?.role === 'action_button');
    expect(buttons.length).toBe(3);
  });

  it('generateUI includes input field', () => {
    const entities = panel.generateUI();
    const input = entities.find(e => e.data?.role === 'input');
    expect(input).toBeDefined();
  });

  it('sendMessage adds user and assistant messages', async () => {
    await panel.sendMessage('Hello');
    const msgs = panel.getMessages();
    expect(msgs.length).toBe(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].text).toBe('Hello');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toBe('AI response');
  });

  it('sendMessage calls copilot.generateFromPrompt', async () => {
    await panel.sendMessage('test');
    expect(copilot.generateFromPrompt).toHaveBeenCalledWith('test');
  });

  it('sendMessage clears input text', async () => {
    panel.setInputText('some text');
    await panel.sendMessage('query');
    // After sending, input should be cleared
    const entities = panel.generateUI();
    const input = entities.find(e => e.data?.role === 'input');
    expect(input!.text).toBe('Type a prompt...');
  });

  it('requestSuggestion adds assistant message', async () => {
    await panel.requestSuggestion();
    const msgs = panel.getMessages();
    expect(msgs.length).toBe(1);
    expect(msgs[0].role).toBe('assistant');
  });

  it('clearMessages empties history', async () => {
    await panel.sendMessage('Hello');
    panel.clearMessages();
    expect(panel.getMessages()).toEqual([]);
  });

  it('setInputText updates display', () => {
    panel.setInputText('new text');
    const entities = panel.generateUI();
    const input = entities.find(e => e.data?.role === 'input');
    expect(input!.text).toBe('new text');
  });

  it('messages appear in generateUI', async () => {
    await panel.sendMessage('Hi');
    const entities = panel.generateUI();
    const msgs = entities.filter(e => e.data?.role === 'message');
    expect(msgs.length).toBe(2);
  });

  it('custom config overrides defaults', () => {
    const p = new CopilotPanel(copilot, { width: 1.0 });
    const entities = p.generateUI();
    const bg = entities.find(e => e.data?.role === 'background');
    expect(bg!.size!.width).toBe(1.0);
  });
});
