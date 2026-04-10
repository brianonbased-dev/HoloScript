import { describe, it, expect } from 'vitest';
import { SemanticSearchService } from '../SemanticSearchService';
import type { AIAdapter } from '../AIAdapter';

describe('SemanticSearchService', () => {
  const mockTraits = [
    { name: 'grabbable', description: 'Makes object grabbable by VR controllers.' },
    { name: 'physics', description: 'Full physics simulation with gravity.' },
    { name: 'glowing', description: 'Object emits a glow effect.' },
  ];

  it('should rank traits by similarity', async () => {
    const mockAdapter: AIAdapter = {
      id: 'mock',
      name: 'Mock Adapter',
      isReady: () => true,
      getEmbeddings: async (text: string | string[]) => {
        const texts = Array.isArray(text) ? text : [text];
        return texts.map((t) => {
          if (t.includes('grab')) return [1, 0, 0];
          if (t.includes('physics')) return [0, 1, 0];
          if (t.includes('glow')) return [0, 0, 1];
          if (t.includes('hand')) return [0.9, 0, 0]; // Close to grab
          return [0, 0, 0];
        });
      },
    };

    const searchService = new SemanticSearchService(mockAdapter, mockTraits);
    await searchService.initialize();

    const results = await searchService.search('something to pick up with my hand');

    expect(results[0].item.name).toBe('grabbable');
    expect(results[0].score).toBeGreaterThan(0.8);
  });
});
