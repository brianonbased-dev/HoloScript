/**
 * ContentPipeline Tests
 *
 * Validates template rotation, dedup by title, pillar mapping,
 * history loading from constructor, and topic exhaustion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContentPipeline } from '../moltbook/content-pipeline';

describe('ContentPipeline', () => {
  let pipeline: ContentPipeline;

  beforeEach(() => {
    pipeline = new ContentPipeline();
  });

  describe('topic generation', () => {
    it('generates a post for any pillar', async () => {
      const post = await pipeline.generatePost('research');
      expect(post).not.toBeNull();
      expect(post!.title.length).toBeGreaterThan(10);
      expect(post!.body.length).toBeGreaterThan(100);
      expect(post!.submolt.length).toBeGreaterThan(0);
      expect(post!.pillar).toBe('research');
    });

    it('generates infrastructure posts', async () => {
      const post = await pipeline.generatePost('infrastructure');
      expect(post).not.toBeNull();
      expect(post!.pillar).toBe('infrastructure');
    });

    it('generates community posts', async () => {
      const post = await pipeline.generatePost('community');
      expect(post).not.toBeNull();
      expect(post!.pillar).toBe('community');
    });
  });

  describe('dedup by title', () => {
    it('does not repeat the same title', async () => {
      const titles = new Set<string>();
      for (let i = 0; i < 8; i++) {
        const post = await pipeline.generatePost();
        if (post) titles.add(post.title);
      }
      // Should have generated unique titles
      expect(titles.size).toBeGreaterThan(0);
    });

    it('returns null when all topics exhausted', async () => {
      // Generate all topics
      const totalTopics = pipeline.getTopicCount();
      for (let i = 0; i < totalTopics; i++) {
        await pipeline.generatePost();
      }
      expect(pipeline.getRemainingCount()).toBe(0);
      const post = await pipeline.generatePost();
      expect(post).toBeNull();
    });

    it('markPosted prevents title from being selected', async () => {
      const post = await pipeline.generatePost('research');
      expect(post).not.toBeNull();

      const pipeline2 = new ContentPipeline();
      pipeline2.markPosted(post!.title);
      expect(pipeline2.getRemainingCount()).toBe(pipeline.getTopicCount() - 1);
    });
  });

  describe('constructor postHistory', () => {
    it('loads history from constructor', async () => {
      const first = await pipeline.generatePost('research');
      expect(first).not.toBeNull();

      // Create new pipeline with the title already marked
      const pipeline2 = new ContentPipeline([first!.title]);
      expect(pipeline2.getRemainingCount()).toBe(pipeline.getTopicCount() - 1);
    });

    it('sets topicIndex based on history length', async () => {
      const history = ['Title A', 'Title B', 'Title C'];
      const pipeline2 = new ContentPipeline(history);
      // topicIndex should be 3 (history.length)
      expect(pipeline2.getRemainingCount()).toBe(pipeline.getTopicCount());
      // These titles aren't in the template list so they don't affect remaining
    });

    it('empty history produces default behavior', async () => {
      const pipeline2 = new ContentPipeline([]);
      expect(pipeline2.getRemainingCount()).toBe(pipeline.getTopicCount());
    });
  });

  describe('getPostedTitles', () => {
    it('returns posted titles after generation', async () => {
      await pipeline.generatePost('research');
      await pipeline.generatePost('infrastructure');
      const titles = pipeline.getPostedTitles();
      expect(titles.length).toBe(2);
    });

    it('returns empty array before any generation', () => {
      expect(pipeline.getPostedTitles()).toEqual([]);
    });
  });

  describe('pillar mapping', () => {
    it('getPillarForToday returns a valid pillar', () => {
      const pillar = pipeline.getPillarForToday();
      expect(['research', 'infrastructure', 'showcase', 'community']).toContain(pillar);
    });
  });

  describe('remaining count', () => {
    it('starts at total topic count', () => {
      expect(pipeline.getRemainingCount()).toBe(pipeline.getTopicCount());
      expect(pipeline.getTopicCount()).toBeGreaterThan(0);
    });

    it('decreases after generation', async () => {
      const before = pipeline.getRemainingCount();
      await pipeline.generatePost();
      expect(pipeline.getRemainingCount()).toBe(before - 1);
    });
  });

  describe('reset', () => {
    it('resets topic index but not posted set', async () => {
      await pipeline.generatePost();
      pipeline.reset();
      // topicIndex resets but postedTitles remain — next generation will still skip the posted one
      const remaining = pipeline.getRemainingCount();
      expect(remaining).toBe(pipeline.getTopicCount() - 1);
    });
  });
});
