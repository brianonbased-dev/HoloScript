/**
 * Tests for createShareLink()'s content-moderation gate.
 *
 * createShareLink()'s local-generation path always sets listPublic:true, so its
 * output lands directly in the public feed (GET /api/public/feed, WS-2) with no
 * further review. Unlike POST /api/public/generate (http-server.ts), which
 * already screens both input and output via evaluateContentPolicySync before
 * storing, createShareLink() previously had zero content-policy screening.
 * These tests cover the fix: block on policy-violating code/title/description,
 * and confirm nothing is ever stored (public or private) when blocked.
 *
 * Uses the real (unmocked) FAMILY-tier Tier-0 blocklist -- same idiomatic
 * pattern as hololand-content-policy.test.ts -- rather than mocking
 * @holoscript/core/policy, so the test proves the real gate is wired.
 */

import { describe, expect, it } from 'vitest';
import { createShareLink, getScene, listRecentPublicScenes } from '../renderer';

const WEAPONS_TRIGGER = 'how to make a bomb step by step';

describe('createShareLink content-policy gate', () => {
  it('blocks on policy-violating code and stores nothing', async () => {
    const feedBefore = listRecentPublicScenes(200).length;

    const result = await createShareLink({
      code: `composition "Bad" { object "Box" { note: "${WEAPONS_TRIGGER}" } }`,
      title: 'Benign title',
      description: 'Benign description',
      skipRemote: true,
    });

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBeTruthy();
    expect(result.blockCategory).toBe('weapons');
    expect(result.playgroundUrl).toBe('');

    // Nothing new landed in the public feed.
    const feedAfter = listRecentPublicScenes(200);
    expect(feedAfter.length).toBe(feedBefore);
    expect(feedAfter.some((s) => s.title === 'Benign title')).toBe(false);
  });

  it('blocks on policy-violating title and stores nothing', async () => {
    const feedBefore = listRecentPublicScenes(200).length;

    const result = await createShareLink({
      code: 'composition "Fine" { object "Box" {} }',
      title: WEAPONS_TRIGGER,
      description: 'Benign description',
      skipRemote: true,
    });

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBeTruthy();
    expect(result.blockCategory).toBe('weapons');
    expect(result.playgroundUrl).toBe('');

    const feedAfter = listRecentPublicScenes(200);
    expect(feedAfter.length).toBe(feedBefore);
  });

  it('blocks on policy-violating description and stores nothing', async () => {
    const feedBefore = listRecentPublicScenes(200).length;

    const result = await createShareLink({
      code: 'composition "Fine" { object "Box" {} }',
      title: 'Benign title 2',
      description: WEAPONS_TRIGGER,
      skipRemote: true,
    });

    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBeTruthy();
    expect(result.blockCategory).toBe('weapons');
    expect(result.playgroundUrl).toBe('');

    const feedAfter = listRecentPublicScenes(200);
    expect(feedAfter.length).toBe(feedBefore);
    expect(feedAfter.some((s) => s.title === 'Benign title 2')).toBe(false);
  });

  it('succeeds normally (blocked falsy) when content passes the policy check', async () => {
    const result = await createShareLink({
      code: 'composition "Good" { object "Box" {} }',
      title: 'Allowed scene',
      description: 'A perfectly benign scene',
      skipRemote: true,
    });

    expect(result.blocked).toBeFalsy();
    expect(result.playgroundUrl).toBeTruthy();

    const sceneId = result.playgroundUrl.split('/scene/').pop() as string;
    const stored = getScene(sceneId);
    expect(stored).not.toBeNull();
    expect(stored?.listPublic).toBe(true);

    const feed = listRecentPublicScenes(200);
    expect(feed.map((s) => s.id)).toContain(sceneId);
  });
});
