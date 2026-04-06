/**
 * AICopilot Production Tests
 * Sprint CLXVI — adapter management, context, chat, generate, explain, autoFix
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AICopilot } from '@holoscript/framework/ai';
import type { AIAdapter } from '@holoscript/framework/ai';

// ---------------------------------------------------------------------------
// Mock adapters
// ---------------------------------------------------------------------------

function makeGenerateAdapter(overrides: Partial<AIAdapter> = {}): AIAdapter {
  return {
    generateHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'scene { @Renderable }',
      objectCount: 3,
      confidence: 0.9,
      warnings: [],
    }),
    ...overrides,
  };
}

function makeFullAdapter(): AIAdapter {
  return {
    generateHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'scene { @Physics }',
      objectCount: 1,
      confidence: 0.85,
      warnings: ['large scene'],
    }),
    explainHoloScript: vi.fn().mockResolvedValue({
      explanation: 'This is a physics scene.',
      concepts: [],
    }),
    fixHoloScript: vi.fn().mockResolvedValue({
      holoScript: 'fixed code',
      fixes: [{ line: 5, issue: 'missing type', fix: 'added type' }],
    }),
    chat: vi.fn().mockResolvedValue('HoloScript is a spatial programming language.'),
  };
}

// ---------------------------------------------------------------------------
// Constructor and adapter management
// ---------------------------------------------------------------------------

describe('AICopilot', () => {
  let copilot: AICopilot;

  beforeEach(() => {
    copilot = new AICopilot();
  });

  describe('adapter management', () => {
    it('starts with no adapter', () => {
      expect(copilot.getAdapter()).toBeNull();
      expect(copilot.isReady()).toBe(false);
    });

    it('setAdapter makes it ready', () => {
      copilot.setAdapter(makeGenerateAdapter());
      expect(copilot.isReady()).toBe(true);
    });

    it('getAdapter returns set adapter', () => {
      const adapter = makeGenerateAdapter();
      copilot.setAdapter(adapter);
      expect(copilot.getAdapter()).toBe(adapter);
    });

    it('constructor accepts adapter directly', () => {
      const adapter = makeGenerateAdapter();
      const c = new AICopilot(adapter);
      expect(c.isReady()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Context management
  // -------------------------------------------------------------------------

  describe('context management', () => {
    it('starts with empty context', () => {
      expect(copilot.getContext()).toEqual({});
    });

    it('updateContext merges partial context', () => {
      copilot.updateContext({ stateKeys: ['hp', 'mana'] });
      copilot.updateContext({ selectedEntity: { id: 'hero', type: 'player' } });
      const ctx = copilot.getContext();
      expect(ctx.stateKeys).toEqual(['hp', 'mana']);
      expect(ctx.selectedEntity?.id).toBe('hero');
    });

    it('getContext returns a copy', () => {
      copilot.updateContext({ entity: 'hero' } as any);
      const ctx1 = copilot.getContext();
      const ctx2 = copilot.getContext();
      expect(ctx1).not.toBe(ctx2);
    });
  });

  // -------------------------------------------------------------------------
  // History management
  // -------------------------------------------------------------------------

  describe('history', () => {
    it('starts with empty history', () => {
      expect(copilot.getHistory()).toHaveLength(0);
    });

    it('clearHistory empties history', async () => {
      copilot.setAdapter(makeFullAdapter());
      await copilot.chat('hello');
      copilot.clearHistory();
      expect(copilot.getHistory()).toHaveLength(0);
    });

    it('getHistory returns a copy', async () => {
      copilot.setAdapter(makeFullAdapter());
      await copilot.chat('hello');
      expect(copilot.getHistory()).not.toBe(copilot.getHistory());
    });
  });

  // -------------------------------------------------------------------------
  // generateFromPrompt
  // -------------------------------------------------------------------------

  describe('generateFromPrompt', () => {
    it('returns NO_ADAPTER error when no adapter is set', async () => {
      const r = await copilot.generateFromPrompt('make a scene');
      expect(r.error).toBe('NO_ADAPTER');
    });

    it('returns UNSUPPORTED when adapter lacks generateHoloScript', async () => {
      copilot.setAdapter({} as AIAdapter);
      const r = await copilot.generateFromPrompt('make a scene');
      expect(r.error).toBe('UNSUPPORTED');
    });

    it('returns response with suggestion on success', async () => {
      copilot.setAdapter(makeGenerateAdapter());
      const r = await copilot.generateFromPrompt('make a scene');
      expect(r.suggestions).toHaveLength(1);
      expect(r.suggestions[0].type).toBe('create');
      expect(r.suggestions[0].holoScript).toBeTruthy();
    });

    it('includes confidence in suggestion', async () => {
      copilot.setAdapter(makeGenerateAdapter());
      const r = await copilot.generateFromPrompt('test');
      expect(r.suggestions[0].confidence).toBeGreaterThan(0);
    });

    it('calls adapter.generateHoloScript with prompt and options', async () => {
      const adapter = makeGenerateAdapter();
      copilot.setAdapter(adapter);
      await copilot.generateFromPrompt('hello', { complexity: 'high' } as any);
      expect(adapter.generateHoloScript).toHaveBeenCalledWith(
        'hello',
        expect.objectContaining({ complexity: 'high' })
      );
    });

    it('includes warnings in response text', async () => {
      const adapter = makeFullAdapter();
      copilot.setAdapter(adapter);
      const r = await copilot.generateFromPrompt('large scene');
      expect(r.text).toContain('large scene');
    });

    it('adds user and assistant messages to history', async () => {
      copilot.setAdapter(makeGenerateAdapter());
      await copilot.generateFromPrompt('prompt text');
      const h = copilot.getHistory();
      expect(h.length).toBe(2);
      expect(h[0].role).toBe('user');
      expect(h[1].role).toBe('assistant');
    });

    it('returns error response on adapter throw', async () => {
      const adapter = makeGenerateAdapter({
        generateHoloScript: vi.fn().mockRejectedValue(new Error('network error')),
      });
      copilot.setAdapter(adapter);
      const r = await copilot.generateFromPrompt('boom');
      expect(r.error).toBe('network error');
      expect(r.text).toContain('network error');
    });
  });

  // -------------------------------------------------------------------------
  // suggestFromSelection
  // -------------------------------------------------------------------------

  describe('suggestFromSelection', () => {
    it('returns NO_ADAPTER when no adapter', async () => {
      const r = await copilot.suggestFromSelection();
      expect(r.error).toBe('NO_ADAPTER');
    });

    it('returns message when no entity selected', async () => {
      copilot.setAdapter(makeGenerateAdapter());
      const r = await copilot.suggestFromSelection();
      expect(r.text).toContain('No entity selected');
      expect(r.error).toBeUndefined();
    });

    it('returns modify suggestion for selected entity', async () => {
      copilot.setAdapter(makeGenerateAdapter());
      copilot.updateContext({
        selectedEntity: { id: 'hero', type: 'player', properties: { hp: 100 } },
      });
      const r = await copilot.suggestFromSelection();
      expect(r.suggestions[0].type).toBe('modify');
      expect(r.text).toContain('player');
    });
  });

  // -------------------------------------------------------------------------
  // explainScene
  // -------------------------------------------------------------------------

  describe('explainScene', () => {
    it('returns NO_ADAPTER when no adapter', async () => {
      const r = await copilot.explainScene('code');
      expect(r.error).toBe('NO_ADAPTER');
    });

    it('returns UNSUPPORTED when adapter lacks explainHoloScript', async () => {
      copilot.setAdapter(makeGenerateAdapter()); // no explainHoloScript
      const r = await copilot.explainScene('code');
      expect(r.error).toBe('UNSUPPORTED');
    });

    it('returns explanation text on success', async () => {
      copilot.setAdapter(makeFullAdapter());
      const r = await copilot.explainScene('scene {}');
      expect(r.text).toBe('This is a physics scene.');
    });

    it('returns error response on adapter throw', async () => {
      const adapter = makeFullAdapter();
      (adapter.explainHoloScript as any) = vi.fn().mockRejectedValue(new Error('fail'));
      copilot.setAdapter(adapter);
      const r = await copilot.explainScene('code');
      expect(r.error).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // autoFix
  // -------------------------------------------------------------------------

  describe('autoFix', () => {
    it('returns NO_ADAPTER when no adapter', async () => {
      const r = await copilot.autoFix('code', ['err']);
      expect(r.error).toBe('NO_ADAPTER');
    });

    it('returns UNSUPPORTED when adapter lacks fixHoloScript', async () => {
      copilot.setAdapter(makeGenerateAdapter()); // no fixHoloScript
      const r = await copilot.autoFix('code', ['err']);
      expect(r.error).toBe('UNSUPPORTED');
    });

    it('returns fix suggestions on success', async () => {
      copilot.setAdapter(makeFullAdapter());
      const r = await copilot.autoFix('broken code', ['type error']);
      expect(r.suggestions).toHaveLength(1);
      expect(r.suggestions[0].type).toBe('fix');
      expect(r.text).toContain('1 issue');
    });

    it('includes line info in fix suggestion description', async () => {
      copilot.setAdapter(makeFullAdapter());
      const r = await copilot.autoFix('bad', ['err']);
      expect(r.suggestions[0].description).toContain('Line 5');
    });
  });

  // -------------------------------------------------------------------------
  // chat
  // -------------------------------------------------------------------------

  describe('chat', () => {
    it('returns NO_ADAPTER when no adapter', async () => {
      const r = await copilot.chat('hello');
      expect(r.error).toBe('NO_ADAPTER');
    });

    it('returns UNSUPPORTED when adapter lacks chat', async () => {
      copilot.setAdapter(makeGenerateAdapter()); // no chat
      const r = await copilot.chat('hello');
      expect(r.error).toBe('UNSUPPORTED');
    });

    it('returns assistant response text', async () => {
      copilot.setAdapter(makeFullAdapter());
      const r = await copilot.chat('What is HoloScript?');
      expect(r.text).toContain('HoloScript');
    });

    it('adds messages to history with correct roles', async () => {
      copilot.setAdapter(makeFullAdapter());
      await copilot.chat('first question');
      const h = copilot.getHistory();
      expect(h[0].role).toBe('user');
      expect(h[0].content).toBe('first question');
      expect(h[1].role).toBe('assistant');
    });

    it('passes history to adapter on multi-turn', async () => {
      const adapter = makeFullAdapter();
      copilot.setAdapter(adapter);
      await copilot.chat('turn 1');
      await copilot.chat('turn 2');
      expect(adapter.chat).toHaveBeenCalledTimes(2);
      const secondCall = (adapter.chat as any).mock.calls[1];
      // Third arg is chat history
      expect(secondCall[2].length).toBeGreaterThan(0);
    });

    it('returns error on adapter throw', async () => {
      const adapter = makeFullAdapter();
      (adapter.chat as any) = vi.fn().mockRejectedValue(new Error('timeout'));
      copilot.setAdapter(adapter);
      const r = await copilot.chat('hello');
      expect(r.error).toBe('timeout');
    });
  });
});
