/**
 * Tests for the WS-2 sovereign-web consumer loop MVP public feed surface:
 * listRecentPublicScenes() and createShareLink()'s listPublic:true opt-in.
 *
 * Safety design under test: a feed turns "obscure but technically public"
 * (GET /scene/:id with a random 8-char ID) into "actively discoverable".
 * listRecentPublicScenes() must ONLY return scenes explicitly opted in via
 * listPublic:true -- never every scene in the shared in-memory sceneStore.
 */

import { describe, expect, it } from 'vitest';
import { storeScene, createShareLink, getScene, listRecentPublicScenes } from '../renderer';

describe('listRecentPublicScenes', () => {
  it('only returns scenes with listPublic:true, excluding unflagged scenes', () => {
    const flagged = storeScene('composition "Public" { object "Box" {} }', {
      title: 'Public Scene',
      listPublic: true,
    });
    const unflagged = storeScene('composition "Private" { object "Box" {} }', {
      title: 'Unflagged Scene',
    });

    const feed = listRecentPublicScenes(50);
    const ids = feed.map((s) => s.id);

    expect(ids).toContain(flagged.id);
    expect(ids).not.toContain(unflagged.id);
  });

  it('excludes scenes stored via the legacy (title, description) signature (never sets listPublic)', () => {
    const legacy = storeScene('composition "Legacy" { object "Box" {} }', 'Legacy Title', 'desc');

    const feed = listRecentPublicScenes(50);
    expect(feed.map((s) => s.id)).not.toContain(legacy.id);
  });

  it('sorts newest-first by createdAt', () => {
    const older = storeScene('composition "Older" {}', { title: 'Older', listPublic: true });
    // Force distinct createdAt ordering deterministically rather than relying on
    // real-clock timing between two storeScene() calls in the same tick.
    const olderScene = getScene(older.id)!;
    olderScene.createdAt = Date.now() - 100_000;

    const newer = storeScene('composition "Newer" {}', { title: 'Newer', listPublic: true });
    const newerScene = getScene(newer.id)!;
    newerScene.createdAt = Date.now();

    const feed = listRecentPublicScenes(50);
    const olderIdx = feed.findIndex((s) => s.id === older.id);
    const newerIdx = feed.findIndex((s) => s.id === newer.id);

    expect(olderIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      storeScene(`composition "Limit${i}" {}`, { title: `Limit ${i}`, listPublic: true });
    }

    const feed = listRecentPublicScenes(3);
    expect(feed.length).toBeLessThanOrEqual(3);
  });

  it('returns the correct lightweight field shape (no `code` field present)', () => {
    const scene = storeScene('composition "Shaped" { object "Box" {} }', {
      title: 'Shaped Scene',
      description: 'A shaped description',
      author: 'tester',
      listPublic: true,
    });

    const feed = listRecentPublicScenes(50);
    const entry = feed.find((s) => s.id === scene.id);

    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      id: scene.id,
      title: 'Shaped Scene',
      description: 'A shaped description',
      author: 'tester',
    });
    expect(entry).not.toHaveProperty('code');
    expect(Object.keys(entry as object).sort()).toEqual(
      ['author', 'createdAt', 'description', 'id', 'thumbnail', 'title'].sort()
    );
  });
});

describe('createShareLink', () => {
  it('sets listPublic:true on the scene it stores locally', async () => {
    const result = await createShareLink({
      code: 'composition "Shared" { object "Box" {} }',
      title: 'Shared via createShareLink',
      description: 'Explicit share-link intent',
      skipRemote: true,
    });

    // playgroundUrl is `${PLAYGROUND_URL}/scene/${scene.id}` -- extract the id.
    const sceneId = result.playgroundUrl.split('/scene/').pop() as string;
    const stored = getScene(sceneId);

    expect(stored).not.toBeNull();
    expect(stored?.listPublic).toBe(true);

    // Also confirm it surfaces through the feed projection.
    const feed = listRecentPublicScenes(50);
    expect(feed.map((s) => s.id)).toContain(sceneId);
  });
});
