/**
 * Tests for QuestGenerator
 *
 * Covers:
 * - Constructor
 * - Fallback response on LLM failure
 * - JSON parsing from LLM response
 * - Markdown code block extraction
 */

import { describe, it, expect, vi } from 'vitest';
import { QuestGenerator, type QuestNarrativeRequest } from './QuestGenerator';
import type { LLMProviderManager } from './provider-manager';

function createMockManager(responseText: string, shouldFail = false): LLMProviderManager {
  return {
    complete: vi.fn().mockImplementation(async () => {
      if (shouldFail) throw new Error('LLM unavailable');
      return { text: responseText, provider: 'mock', tokensUsed: 10, latencyMs: 50 };
    }),
  } as any;
}

const testRequest: QuestNarrativeRequest = {
  business_name: 'Holo Coffee',
  business_type: 'cafe',
  location: 'Downtown',
  theme: 'cozy',
};

describe('QuestGenerator', () => {
  describe('generateQuestNarrative', () => {
    it('parses direct JSON response', async () => {
      const json = JSON.stringify({
        title: 'Coffee Quest',
        description: 'Find the golden latte',
        npc_greeting: 'Hello barista!',
        success_message: 'You found it!',
      });
      const gen = new QuestGenerator(createMockManager(json));
      const result = await gen.generateQuestNarrative(testRequest);

      expect(result.title).toBe('Coffee Quest');
      expect(result.description).toBe('Find the golden latte');
      expect(result.npc_greeting).toBe('Hello barista!');
      expect(result.success_message).toBe('You found it!');
    });

    it('extracts JSON from markdown code block', async () => {
      const markdown =
        '```json\n{"title":"Wrapped Quest","description":"In a block","npc_greeting":"Hi","success_message":"Done"}\n```';
      const gen = new QuestGenerator(createMockManager(markdown));
      const result = await gen.generateQuestNarrative(testRequest);

      expect(result.title).toBe('Wrapped Quest');
    });

    it('uses fallback on LLM failure', async () => {
      const gen = new QuestGenerator(createMockManager('', true));
      const result = await gen.generateQuestNarrative(testRequest);

      expect(result.title).toContain('Holo Coffee');
      expect(result.description).toContain('Downtown');
      expect(result.npc_greeting).toContain('Holo Coffee');
    });

    it('uses fallback defaults for missing fields', async () => {
      const partialJson = JSON.stringify({ title: 'Partial' });
      const gen = new QuestGenerator(createMockManager(partialJson));
      const result = await gen.generateQuestNarrative(testRequest);

      expect(result.title).toBe('Partial');
      expect(result.description).toBeTruthy();
      expect(result.npc_greeting).toBeTruthy();
      expect(result.success_message).toBeTruthy();
    });
  });
});
