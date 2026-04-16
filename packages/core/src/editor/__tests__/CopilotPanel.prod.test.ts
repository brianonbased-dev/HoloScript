/**
 * CopilotPanel — Production Tests
 *
 * Tests CopilotPanel UI generation, sendMessage flow,
 * requestSuggestion, setInputText, getMessages, clearMessages,
 * message history trimming, and config overrides.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CopilotPanel } from '../CopilotPanel';
import { AICopilot } from '@holoscript/framework/ai';
import type { AIAdapter } from '@holoscript/framework/ai';

// =============================================================================
// MOCK HELPERS
// =============================================================================

function makeAdapter(text = 'Generated!'): AIAdapter {
  return {
    name: 'mock',
    generateHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'object X {}',
      confidence: 0.9,
      objectCount: 1,
      warnings: [],
    }),
    suggestFromSelection: vi.fn(),
    explainHoloScript: vi.fn().mockResolvedValue({ explanation: text }),
    fixHoloScript: vi.fn(),
    chat: vi.fn().mockResolvedValue(text),
  } as unknown as AIAdapter;
}

function makeCopilot(text = 'ok'): AICopilot {
  return new AICopilot(makeAdapter(text));
}

// =============================================================================
// CONSTRUCTION
// =============================================================================

describe('CopilotPanel — Construction', () => {
  it('constructs with default config', () => {
    const panel = new CopilotPanel(makeCopilot());
    expect(panel).toBeDefined();
  });

  it('accepts partial config override', () => {
    const panel = new CopilotPanel(makeCopilot(), { maxMessages: 5 });
    expect(panel).toBeDefined();
  });
});

// =============================================================================
// generateUI — structure
// =============================================================================

describe('CopilotPanel — generateUI (empty messages)', () => {
  let panel: CopilotPanel;

  beforeEach(() => {
    panel = new CopilotPanel(makeCopilot());
  });

  it('returns at least a background panel entity', () => {
    const entities = panel.generateUI();
    const bg = entities.find((e) => e.id === 'copilot_bg');
    expect(bg).toBeDefined();
    expect(bg!.type).toBe('panel');
  });

  it('returns a title label', () => {
    const entities = panel.generateUI();
    const title = entities.find((e) => e.id === 'copilot_title');
    expect(title).toBeDefined();
    expect(title!.type).toBe('label');
  });

  it('returns an input field', () => {
    const entities = panel.generateUI();
    const input = entities.find((e) => e.id === 'copilot_input');
    expect(input).toBeDefined();
    expect(input!.type).toBe('input');
  });

  it('returns 3 action buttons', () => {
    const entities = panel.generateUI();
    const buttons = entities.filter((e) => e.type === 'button');
    expect(buttons).toHaveLength(3);
  });

  it('input field shows placeholder text when inputText is empty', () => {
    const entities = panel.generateUI();
    const input = entities.find((e) => e.id === 'copilot_input');
    expect(input!.text).toBe('Type a prompt...');
  });
});

// =============================================================================
// generateUI — with messages
// =============================================================================

describe('CopilotPanel — generateUI (with messages)', () => {
  it('generates message entities for each message', async () => {
    const panel = new CopilotPanel(makeCopilot('reply'));
    await panel.sendMessage('hello');
    const entities = panel.generateUI();
    const messages = entities.filter((e) => e.type === 'message');
    // 1 user + 1 assistant = 2 messages
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  it('message entity text includes user icon for user messages', async () => {
    const panel = new CopilotPanel(makeCopilot());
    await panel.sendMessage('test query');
    const entities = panel.generateUI();
    const userMsg = entities.find(
      (e) => e.type === 'message' && e.text?.includes('👤') && e.text?.includes('test query')
    );
    expect(userMsg).toBeDefined();
  });

  it('message entity text includes bot icon for assistant messages', async () => {
    const panel = new CopilotPanel(makeCopilot('bot reply'));
    await panel.sendMessage('q');
    const entities = panel.generateUI();
    const botMsg = entities.find((e) => e.type === 'message' && e.text?.includes('🤖'));
    expect(botMsg).toBeDefined();
  });
});

// =============================================================================
// setInputText
// =============================================================================

describe('CopilotPanel — setInputText', () => {
  it('updates the input field text in generateUI', () => {
    const panel = new CopilotPanel(makeCopilot());
    panel.setInputText('make a dragon');
    const entities = panel.generateUI();
    const input = entities.find((e) => e.id === 'copilot_input');
    expect(input!.text).toBe('make a dragon');
  });

  it('clears to placeholder after sendMessage resets input', async () => {
    const panel = new CopilotPanel(makeCopilot());
    panel.setInputText('some prompt');
    await panel.sendMessage('some prompt');
    const entities = panel.generateUI();
    const input = entities.find((e) => e.id === 'copilot_input');
    expect(input!.text).toBe('Type a prompt...');
  });
});

// =============================================================================
// sendMessage
// =============================================================================

describe('CopilotPanel — sendMessage', () => {
  it('appends user + assistant messages to internal list', async () => {
    const panel = new CopilotPanel(makeCopilot('hi'));
    await panel.sendMessage('hello');
    const msgs = panel.getMessages();
    expect(msgs.some((m) => m.role === 'user')).toBe(true);
    expect(msgs.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('returns the CopilotResponse from generateFromPrompt', async () => {
    const panel = new CopilotPanel(makeCopilot());
    const res = await panel.sendMessage('build a cube');
    expect(res).toBeDefined();
    expect(typeof res.text).toBe('string');
  });

  it('trims history when exceeding maxMessages * 2', async () => {
    const panel = new CopilotPanel(makeCopilot(), { maxMessages: 2 });
    // 3 sends → 6 messages (user+assistant each), should be trimmed to 2 after threshold
    await panel.sendMessage('m1');
    await panel.sendMessage('m2');
    await panel.sendMessage('m3');
    // After last trim: ≤ maxMessages
    expect(panel.getMessages().length).toBeLessThanOrEqual(4);
  });

  it('returns fallback response and appends assistant error message when generateFromPrompt throws', async () => {
    const adapter = makeAdapter();
    adapter.generateHoloScript = vi.fn().mockRejectedValue(new Error('model unavailable')) as any;
    const panel = new CopilotPanel(new AICopilot(adapter));

    const res = await panel.sendMessage('hello');

    expect(res.error).toBe('model unavailable');
    expect(res.text).toContain('model unavailable');
    const msgs = panel.getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].text).toContain('model unavailable');
  });
});

// =============================================================================
// requestSuggestion
// =============================================================================

describe('CopilotPanel — requestSuggestion', () => {
  it('appends assistant message from suggestFromSelection', async () => {
    const panel = new CopilotPanel(makeCopilot());
    await panel.requestSuggestion();
    const msgs = panel.getMessages();
    expect(msgs.some((m) => m.role === 'assistant')).toBe(true);
  });

  it('returns the CopilotResponse', async () => {
    const panel = new CopilotPanel(makeCopilot());
    const res = await panel.requestSuggestion();
    expect(res).toBeDefined();
  });

  it('trims history when repeated suggestion calls exceed maxMessages * 2', async () => {
    const panel = new CopilotPanel(makeCopilot('suggested'), { maxMessages: 2 });
    await panel.requestSuggestion();
    await panel.requestSuggestion();
    await panel.requestSuggestion();
    await panel.requestSuggestion();
    await panel.requestSuggestion();
    expect(panel.getMessages().length).toBeLessThanOrEqual(2);
  });

  it('returns fallback response and appends assistant error message when suggestFromSelection throws', async () => {
    const throwingCopilot = {
      suggestFromSelection: vi.fn().mockRejectedValue('selection failed'),
    } as unknown as AICopilot;
    const panel = new CopilotPanel(throwingCopilot);

    const res = await panel.requestSuggestion();

    expect(res.error).toBe('selection failed');
    expect(res.text).toContain('selection failed');
    const msgs = panel.getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe('assistant');
    expect(msgs[0].text).toContain('selection failed');
  });
});

// =============================================================================
// getMessages / clearMessages
// =============================================================================

describe('CopilotPanel — getMessages / clearMessages', () => {
  it('getMessages returns copy (mutations do not affect internal state)', async () => {
    const panel = new CopilotPanel(makeCopilot());
    await panel.sendMessage('hello');
    const msgs = panel.getMessages();
    msgs.push({ role: 'user', text: 'injected' });
    expect(panel.getMessages().some((m) => m.text === 'injected')).toBe(false);
  });

  it('clearMessages empties the list', async () => {
    const panel = new CopilotPanel(makeCopilot());
    await panel.sendMessage('hello');
    panel.clearMessages();
    expect(panel.getMessages()).toHaveLength(0);
  });

  it('generateUI shows no messages after clearMessages', async () => {
    const panel = new CopilotPanel(makeCopilot());
    await panel.sendMessage('hello');
    panel.clearMessages();
    const entities = panel.generateUI();
    expect(entities.filter((e) => e.type === 'message')).toHaveLength(0);
  });
});
