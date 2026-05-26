import { describe, expect, it } from 'vitest';
import {
  generateStoryTextFromContext,
  generateQuestNarrativeFromContext,
  handleStoryWeaverGenerationRoutes,
} from '../storyweaver-generation-routes';

/**
 * StoryWeaver generation routes — orphan-route remediation.
 *
 * The route file previously had zero workspace callers. These tests
 * serve as the first callers, verifying the generation surface is
 * reachable and returns non-empty output.
 */

describe('storyweaver-generation-routes', () => {
  describe('generateStoryTextFromContext', () => {
    it('returns a non-empty narrative and beats array', async () => {
      const result = await generateStoryTextFromContext({
        vrrContext: {
          compositionName: 'Test VRR',
          twinMirrorId: 'mirror-1',
          businesses: [
            {
              id: 'biz-1',
              displayName: 'Test Biz',
              geo: { lat: 33.4, lng: -112.1 },
            },
          ],
        },
        theme: 'cyberpunk',
        difficulty: 'medium',
        focus: 'intro',
      });

      expect(result.narrative).toBeTruthy();
      expect(result.narrative.length).toBeGreaterThan(0);
      expect(result.beats).toBeInstanceOf(Array);
      expect(result.beats.length).toBeGreaterThan(0);
      expect(result.meta.theme).toBe('cyberpunk');
      expect(result.meta.difficulty).toBe('medium');
    });
  });

  describe('generateQuestNarrativeFromContext', () => {
    it('returns a quest with non-empty title and objectives', async () => {
      const result = await generateQuestNarrativeFromContext({
        vrrContext: {
          compositionName: 'Test VRR',
          twinMirrorId: 'mirror-1',
          businesses: [
            {
              id: 'biz-1',
              displayName: 'Test Biz',
              geo: { lat: 33.4, lng: -112.1 },
            },
          ],
        },
        theme: 'fantasy',
        difficulty: 'hard',
      });

      expect(result.title).toBeTruthy();
      expect(result.title.length).toBeGreaterThan(0);
      expect(result.loreDescription).toBeTruthy();
      expect(result.objectives).toBeInstanceOf(Array);
      expect(result.objectives.length).toBeGreaterThan(0);
      expect(result.npcDialogue).toBeInstanceOf(Array);
      expect(result.rewardMetadata.assetId).toBeTruthy();
    });
  });

  describe('handleStoryWeaverGenerationRoutes', () => {
    it('returns true for its own pathname', async () => {
      // Minimal smoke: the exported handler exists and matches its routes.
      // Full HTTP+auth coverage is handled by the integration layer in
      // holomesh/http-routes.ts where the handler is wired.
      const handled = await handleStoryWeaverGenerationRoutes(
        { method: 'POST', headers: { authorization: 'Bearer dummy' } } as any,
        { writeHead: () => {}, end: () => {}, setHeader: () => {} } as any,
        '/api/holomesh/storyweaver/generate/narrative',
        'POST',
        '/api/holomesh/storyweaver/generate/narrative'
      );
      expect(handled).toBe(true);
    });
  });
});
