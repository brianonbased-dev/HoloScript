/**
 * Tests for GET /api/public/feed — WS-2 sovereign-web consumer loop MVP.
 *
 * Pattern follows public-generate-endpoint.test.ts / public-tool-endpoint.test.ts —
 * re-implement the handler as a pure function so the whole MCP server doesn't
 * need to boot. listRecentPublicScenes is mocked at the boundary; this test
 * proves the ROUTING contract (limit parsing/clamping, previewUrl shaping,
 * empty-array passthrough), not listRecentPublicScenes' own filter/sort logic
 * (covered by renderer-feed.test.ts).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const listRecentPublicScenesMock = vi.fn();

type Response = { status: number; body: Record<string, unknown> };

type FeedScene = {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  author?: string;
  thumbnail?: string;
};

function publicFeedHandler(url: string): Response {
  const parsedUrl = new URL(url, 'http://localhost');
  const limitParam = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, limitParam)) : 20;

  const scenes = (listRecentPublicScenesMock(limit) as FeedScene[]).map((scene) => ({
    ...scene,
    previewUrl: `/scene/${scene.id}`,
  }));

  return { status: 200, body: { scenes } };
}

describe('GET /api/public/feed — WS-2 public feed', () => {
  beforeEach(() => {
    listRecentPublicScenesMock.mockReset();
    listRecentPublicScenesMock.mockReturnValue([]);
  });

  it('returns { scenes: [] } gracefully when there are zero public scenes', () => {
    const res = publicFeedHandler('/api/public/feed');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ scenes: [] });
  });

  it('adds previewUrl to each scene, matching the /scene/:id pattern', () => {
    listRecentPublicScenesMock.mockReturnValue([
      { id: 'scene_abc123', title: 'A Scene', description: 'desc', createdAt: 1000 },
    ]);

    const res = publicFeedHandler('/api/public/feed');
    expect(res.body.scenes).toEqual([
      {
        id: 'scene_abc123',
        title: 'A Scene',
        description: 'desc',
        createdAt: 1000,
        previewUrl: '/scene/scene_abc123',
      },
    ]);
  });

  it('defaults to limit=20 when no query param is present', () => {
    publicFeedHandler('/api/public/feed');
    expect(listRecentPublicScenesMock).toHaveBeenCalledWith(20);
  });

  it('respects an explicit ?limit=N within range', () => {
    publicFeedHandler('/api/public/feed?limit=5');
    expect(listRecentPublicScenesMock).toHaveBeenCalledWith(5);
  });

  it('clamps a ?limit above 50 down to 50', () => {
    publicFeedHandler('/api/public/feed?limit=999');
    expect(listRecentPublicScenesMock).toHaveBeenCalledWith(50);
  });

  it('clamps a ?limit below 1 up to 1', () => {
    publicFeedHandler('/api/public/feed?limit=0');
    expect(listRecentPublicScenesMock).toHaveBeenCalledWith(1);

    publicFeedHandler('/api/public/feed?limit=-5');
    expect(listRecentPublicScenesMock).toHaveBeenCalledWith(1);
  });

  it('falls back to the default limit for a non-numeric ?limit', () => {
    publicFeedHandler('/api/public/feed?limit=notanumber');
    expect(listRecentPublicScenesMock).toHaveBeenCalledWith(20);
  });

  it('returns multiple scenes in the order provided by listRecentPublicScenes', () => {
    listRecentPublicScenesMock.mockReturnValue([
      { id: 'scene_1', title: 'First', description: '', createdAt: 2000 },
      { id: 'scene_2', title: 'Second', description: '', createdAt: 1000 },
    ]);

    const res = publicFeedHandler('/api/public/feed');
    const scenes = res.body.scenes as FeedScene[];
    expect(scenes.map((s) => s.id)).toEqual(['scene_1', 'scene_2']);
  });
});
