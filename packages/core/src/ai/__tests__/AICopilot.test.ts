import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AICopilot } from '@holoscript/framework/ai';
import type { AIAdapter } from '@holoscript/framework/ai';

function mockAdapter(overrides = {}): AIAdapter {
  return {
    id: 'mock',
    name: 'Mock Adapter',
    isReady: () => true,
    generateHoloScript: vi.fn(async () => ({
      holoScript: 'scene { }',
      confidence: 0.9,
      objectCount: 1,
    })),
    explainHoloScript: vi.fn(async () => ({
      explanation: 'This is a scene.',
    })),
    fixHoloScript: vi.fn(async () => ({
      holoScript: 'scene { }',
      fixes: [{ line: 1, issue: 'typo', fix: 'fixed typo' }],
    })),
    chat: vi.fn(async () => 'Hello from AI'),
    ...overrides,
  };
}

describe('AICopilot', () => {
  let copilot: AICopilot;
  let adapter: AIAdapter;

  beforeEach(() => {
    adapter = mockAdapter();
    copilot = new AICopilot();
  });

  // --- Adapter management ---
  it('isReady returns false without adapter', () => {
    expect(copilot.isReady()).toBe(false);
  });

  it('setAdapter makes copilot ready', () => {
    copilot.setAdapter(adapter);
    expect(copilot.isReady()).toBe(true);
    expect(copilot.getAdapter()).toBe(adapter);
  });

  it('constructor with adapter sets it', () => {
    const c2 = new AICopilot(adapter);
    expect(c2.isReady()).toBe(true);
  });

  // --- Context management ---
  it('getContext returns empty initially', () => {
    expect(copilot.getContext()).toEqual({});
  });

  it('updateContext merges context', () => {
    copilot.updateContext({ selectedEntity: { id: 'e1', type: 'mesh' } });
    copilot.updateContext({ stateKeys: ['health', 'score'] });
    const ctx = copilot.getContext();
    expect(ctx.selectedEntity!.id).toBe('e1');
    expect(ctx.stateKeys).toContain('health');
  });

  it('getContext returns shallow copy', () => {
    copilot.updateContext({ stateKeys: ['a'] });
    const c1 = copilot.getContext();
    // Shallow copy: mutating the top-level object doesn't affect original
    c1.selectedEntity = { id: 'injected', type: 'test' };
    expect(copilot.getContext().selectedEntity).toBeUndefined();
  });

  // --- History management ---
  it('getHistory returns empty initially', () => {
    expect(copilot.getHistory()).toHaveLength(0);
  });

  it('clearHistory empties history', async () => {
    copilot.setAdapter(adapter);
    await copilot.generateFromPrompt('hello');
    expect(copilot.getHistory().length).toBeGreaterThan(0);
    copilot.clearHistory();
    expect(copilot.getHistory()).toHaveLength(0);
  });

  // --- generateFromPrompt ---
  it('generateFromPrompt returns error without adapter', async () => {
    const result = await copilot.generateFromPrompt('make a box');
    expect(result.error).toBe('NO_ADAPTER');
  });

  it('generateFromPrompt calls adapter and returns suggestions', async () => {
    copilot.setAdapter(adapter);
    const result = await copilot.generateFromPrompt('make a box');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].type).toBe('create');
    expect(adapter.generateHoloScript).toHaveBeenCalled();
  });

  it('generateFromPrompt adds to history', async () => {
    copilot.setAdapter(adapter);
    await copilot.generateFromPrompt('test');
    const history = copilot.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  it('generateFromPrompt handles adapter error', async () => {
    const errorAdapter = mockAdapter({
      generateHoloScript: vi.fn(async () => {
        throw new Error('API down');
      }),
    });
    copilot.setAdapter(errorAdapter);
    const result = await copilot.generateFromPrompt('test');
    expect(result.error).toContain('API down');
  });

  // --- suggestFromSelection ---
  it('suggestFromSelection returns error without adapter', async () => {
    const result = await copilot.suggestFromSelection();
    expect(result.error).toBe('NO_ADAPTER');
  });

  it('suggestFromSelection returns message when no entity selected', async () => {
    copilot.setAdapter(adapter);
    const result = await copilot.suggestFromSelection();
    expect(result.text).toContain('No entity selected');
  });

  it('suggestFromSelection works with entity', async () => {
    copilot.setAdapter(adapter);
    copilot.updateContext({
      selectedEntity: { id: 'box1', type: 'mesh', properties: { color: 'red' } },
    });
    const result = await copilot.suggestFromSelection();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].type).toBe('modify');
  });

  // --- explainScene ---
  it('explainScene returns error without adapter', async () => {
    const result = await copilot.explainScene('scene {}');
    expect(result.error).toBe('NO_ADAPTER');
  });

  it('explainScene calls adapter', async () => {
    copilot.setAdapter(adapter);
    const result = await copilot.explainScene('scene { box {} }');
    expect(result.text).toBe('This is a scene.');
  });

  // --- autoFix ---
  it('autoFix returns error without adapter', async () => {
    const result = await copilot.autoFix('broken', ['err1']);
    expect(result.error).toBe('NO_ADAPTER');
  });

  it('autoFix returns fix suggestions', async () => {
    copilot.setAdapter(adapter);
    const result = await copilot.autoFix('broken code', ['syntax error']);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].type).toBe('fix');
  });

  // --- chat ---
  it('chat returns error without adapter', async () => {
    const result = await copilot.chat('hi');
    expect(result.error).toBe('NO_ADAPTER');
  });

  it('chat returns AI response', async () => {
    copilot.setAdapter(adapter);
    const result = await copilot.chat('how do I add physics?');
    expect(result.text).toBe('Hello from AI');
  });
});
