import { describe, expect, test } from 'vitest';
import { QuestGenerator } from '../QuestGenerator';
import { LLMProviderManager } from '../provider-manager';
import { MockAdapter } from '../adapters/mock';

describe('QuestGenerator', () => {
  test('should parse valid JSON narrative hooks', async () => {
    // We override the default mock response to output JSON.
    // Match LLMCompletionResponse contract (types.ts:61) — `content`, not `text`.
    class QuestMockAdapter extends MockAdapter {
      async complete(req: any): Promise<any> {
        return {
          content: JSON.stringify({
            title: 'Neon Coffee Run',
            description: 'Find the hidden holographic beans.',
            npc_greeting: 'Welcome to CyberBrew! We need your help.',
            success_message: 'You found them! Enjoy your latte.',
          }),
          provider: 'mock',
          model: 'mock',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        };
      }
    }

    const manager = new LLMProviderManager({
      providers: { mock: new QuestMockAdapter() as any },
      strategy: { primary: 'mock' },
    });

    const generator = new QuestGenerator(manager);

    const result = await generator.generateQuestNarrative({
      business_name: 'CyberBrew',
      business_type: 'Coffee Shop',
      location: 'Neo-Phoenix Plz',
    });

    expect(result.title).toBe('Neon Coffee Run');
    expect(result.description).toContain('holographic beans');
    expect(result.npc_greeting).toBe('Welcome to CyberBrew! We need your help.');
  });
});
