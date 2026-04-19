import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { computeHoloMapReplayFingerprint } from '@holoscript/core/reconstruction';

/** Must match default in `src/lib/scan-session-manifest.ts` when HOLOMAP_SESSION_MODEL_HASH is unset. */
const STUDIO_SCAN_DEFAULT_MODEL_HASH = 'studio-room-scan-mvp';

/**
 * Room scan: API + mobile capture → session done + SimulationContract replay fingerprint.
 * Desktop /scan-room (GitHub OAuth) is covered in staging with real auth; local dev keeps POST open unless STUDIO_SCAN_SESSION_REQUIRE_AUTH=1.
 */
test.describe.serial('Reconstruction scan session', () => {
  test('mobile upload completes with deterministic replay fingerprint', async ({ page, request }) => {
    const create = await request.post('/api/reconstruction/session', {
      data: { weightStrategy: 'distill' },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    const { token } = (await create.json()) as { token: string };
    expect(token.length).toBeGreaterThan(20);

    const videoBody = Buffer.alloc(10_000, 7);
    const videoHash = createHash('sha256').update(videoBody).digest('hex');

    await page.goto(`/scan-room/mobile/${encodeURIComponent(token)}`);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e-cap.mp4',
      mimeType: 'video/mp4',
      buffer: videoBody,
    });

    await expect(page.getByText(/Capture sent/i)).toBeVisible({ timeout: 30_000 });

    let replayFingerprint: string | undefined;
    for (let i = 0; i < 60; i += 1) {
      const r = await request.get(`/api/reconstruction/session?t=${encodeURIComponent(token)}`);
      expect(r.ok()).toBeTruthy();
      const body = (await r.json()) as { status: string; replayFingerprint?: string };
      if (body.status === 'done' && body.replayFingerprint) {
        replayFingerprint = body.replayFingerprint;
        break;
      }
      await page.waitForTimeout(400);
    }

    expect(replayFingerprint).toBeTruthy();
    const expected = computeHoloMapReplayFingerprint({
      modelHash: process.env.HOLOMAP_SESSION_MODEL_HASH?.trim() || STUDIO_SCAN_DEFAULT_MODEL_HASH,
      seed: 0,
      weightStrategy: 'distill',
      videoHash,
    });
    expect(replayFingerprint).toBe(expected);
  });

  test('POST /api/reconstruction/session is rate limited', async ({ request }) => {
    let saw429 = false;
    for (let i = 0; i < 24; i += 1) {
      const res = await request.post('/api/reconstruction/session', {
        data: { weightStrategy: 'distill' },
      });
      if (res.status() === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBe(true);
  });
});
