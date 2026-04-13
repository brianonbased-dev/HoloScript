import { describe, it, expect, vi } from 'vitest';
import { AICopilot } from '@holoscript/framework/ai';
import { CopilotPanel } from '../editor/CopilotPanel';
import { AIAdapter } from '@holoscript/framework/ai';

// =============================================================================
// MOCK AI ADAPTER
// =============================================================================

function createMockAdapter(): AIAdapter {
  return {
    id: 'mock',
    name: 'Mock Adapter',
    isReady: () => true,
    generateHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'object "cube" { position: [0, 1, 0] }',
      confidence: 0.95,
      objectCount: 1,
      warnings: [],
    }),
    explainHoloScript: vi.fn().mockResolvedValue({
      explanation: 'This creates a cube at position (0, 1, 0).',
      breakdown: [],
    }),
    fixHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'object "cube" { position: [0, 1, 0] }',
      fixes: [{ line: 1, issue: 'Missing semicolon', fix: 'Added semicolon' }],
    }),
    optimizeHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'object "cube" { position: [0, 1, 0] }',
      improvements: ['Removed redundant properties'],
    }),
    completeHoloScript: vi.fn().mockResolvedValue(['position:', 'rotation:', 'scale:']),
    chat: vi.fn().mockResolvedValue('I can help you build a HoloScript scene!'),
    getEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  };
}

describe('Cycle 104: AI Copilot Integration', () => {
  // -------------------------------------------------------------------------
  // AICopilot
  // -------------------------------------------------------------------------

  it('should initialize without adapter and report not ready', () => {
    const copilot = new AICopilot();
    expect(copilot.isReady()).toBe(false);
  });

  it('should initialize with adapter and report ready', () => {
    const adapter = createMockAdapter();
    const copilot = new AICopilot(adapter);
    expect(copilot.isReady()).toBe(true);
    expect(copilot.getAdapter()).toBe(adapter);
  });

  it('should return error response when no adapter is configured', async () => {
    const copilot = new AICopilot();
    const response = await copilot.generateFromPrompt('create a cube');
    expect(response.error).toBe('NO_ADAPTER');
    expect(response.suggestions).toHaveLength(0);
  });

  it('should generate HoloScript from a prompt', async () => {
    const adapter = createMockAdapter();
    const copilot = new AICopilot(adapter);

    const response = await copilot.generateFromPrompt('create a cube');

    expect(response.error).toBeUndefined();
    expect(response.suggestions).toHaveLength(1);
    expect(response.suggestions[0].type).toBe('create');
    expect(response.suggestions[0].holoScript).toContain('cube');
    expect(response.suggestions[0].confidence).toBe(0.95);
    expect(adapter.generateHoloScript).toHaveBeenCalledTimes(1);
  });

  it('should maintain conversation history', async () => {
    const adapter = createMockAdapter();
    const copilot = new AICopilot(adapter);

    await copilot.generateFromPrompt('create a cube');
    const history = copilot.getHistory();

    expect(history).toHaveLength(2); // user + assistant
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  it('should suggest modifications for selected entity', async () => {
    const adapter = createMockAdapter();
    const copilot = new AICopilot(adapter);

    copilot.updateContext({
      selectedEntity: {
        id: 'entity_1',
        type: 'box',
        properties: { color: 'red', size: 1 },
      },
    });

    const response = await copilot.suggestFromSelection();
    expect(response.suggestions).toHaveLength(1);
    expect(response.suggestions[0].type).toBe('modify');
  });

  it('should return helpful message when no entity selected', async () => {
    const adapter = createMockAdapter();
    const copilot = new AICopilot(adapter);

    const response = await copilot.suggestFromSelection();
    expect(response.text).toContain('No entity selected');
  });

  it('should auto-fix code with errors', async () => {
    const adapter = createMockAdapter();
    const copilot = new AICopilot(adapter);

    const response = await copilot.autoFix('object "cube" { position: [0, 1, 0] }', [
      'Missing semicolon',
    ]);

    expect(response.suggestions).toHaveLength(1);
    expect(response.suggestions[0].type).toBe('fix');
    expect(adapter.fixHoloScript).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // CopilotPanel
  // -------------------------------------------------------------------------

  it('should generate UI entities for the panel', () => {
    const copilot = new AICopilot(createMockAdapter());
    const panel = new CopilotPanel(copilot);
    const entities = panel.generateUI();

    // Background + title + input + 3 buttons = at least 6
    expect(entities.length).toBeGreaterThanOrEqual(6);

    const bg = entities.find((e) => e.data?.role === 'background');
    expect(bg).toBeDefined();

    const title = entities.find((e) => e.data?.role === 'title');
    expect(title?.text).toContain('Copilot');

    const buttons = entities.filter((e) => e.data?.role === 'action_button');
    expect(buttons).toHaveLength(3);
  });

  it('should send messages and track history', async () => {
    const copilot = new AICopilot(createMockAdapter());
    const panel = new CopilotPanel(copilot);

    const response = await panel.sendMessage('make a sphere');
    expect(response.suggestions.length).toBeGreaterThan(0);

    const messages = panel.getMessages();
    expect(messages).toHaveLength(2); // user + assistant
    expect(messages[0].role).toBe('user');
    expect(messages[0].text).toBe('make a sphere');
  });
});
