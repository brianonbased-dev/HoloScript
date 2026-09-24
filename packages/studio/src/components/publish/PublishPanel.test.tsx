// @vitest-environment jsdom
/**
 * The Toolbar "Publish" screen draws the QR a headset scans, so that QR must encode
 * /shared/<id>, never the /w/ short link HoloQR refuses (claude3's review of #315: this
 * screen still drew /w/ while the PR claimed every world QR was fixed).
 *
 * Adapted from claude3's probe. It mounts the REAL PublishPanel and runs the REAL
 * receipt builder (buildNoAppWebxrPublishReceipt); what stands in is the network the
 * panel calls (answered with that real receipt), the scene store, and the QR library,
 * whose stand-in returns a "PNG" that carries the exact text it was asked to encode, so
 * the test reads back what the drawn QR would say. Named limitation: it proves the text
 * handed to the encoder, not the pixels, and not a real scan on a headset.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import * as qrcode from 'qrcode';

vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));
type SceneState = { code: string; metadata: { name: string } };
vi.mock('@/lib/stores', () => ({
  useSceneStore: (selector: (s: SceneState) => unknown) =>
    selector({ code: 'scene code', metadata: { name: 'Test Scene' } }),
}));

import { buildNoAppWebxrPublishReceipt } from '@/lib/publish/noAppWebxrPublish';
import { PublishPanel } from './PublishPanel';

describe('PublishPanel (Toolbar Publish): the QR after a publish', () => {
  const toDataURL = vi.mocked(qrcode.toDataURL);

  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockImplementation(
      (async (text: string) => `data:image/png;base64,ENCODES[${text}]`) as never
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/api/extract')) {
          return {
            ok: true,
            json: async () => ({
              contentHash: 'h'.repeat(64),
              traits: [],
              objectCount: 1,
              importCount: 0,
              codeLength: 11,
              alreadyPublished: false,
              existingUrl: null,
              revenue: null,
            }),
          };
        }
        const receipt = await buildNoAppWebxrPublishReceipt({
          body: { code: 'scene code', name: 'Test Scene' },
          protocol: null,
          baseUrl: 'https://holoscript.studio',
          id: 'abc12345',
        });
        return { ok: true, json: async () => receipt };
      })
    );
  });

  it('encodes /shared/<id> and never /w/', async () => {
    render(<PublishPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /preview & extract/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }));
    const img = await screen.findByAltText('No-app WebXR QR code');
    const src = img.getAttribute('src') ?? '';
    expect(src).toContain('/shared/abc12345');
    expect(src).not.toContain('/w/');
  });
});
