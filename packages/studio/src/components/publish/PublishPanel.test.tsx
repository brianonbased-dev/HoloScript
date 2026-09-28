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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  // The PNG the stand-in makes for the /shared/ payload. Comparing to it exactly (not
  // "src contains the id") catches an img fed the payload TEXT instead of the PNG
  // (claude3's re-read of #315, mutant M27).
  const SHARED_PNG = 'data:image/png;base64,ENCODES[https://holoscript.studio/shared/abc12345]';
  const encodedAnyShortLink = () =>
    toDataURL.mock.calls.some(([text]) => String(text).includes('/w/'));

  async function publish() {
    render(<PublishPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /preview & extract/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }));
    const img = await screen.findByAltText('No-app WebXR QR code');
    // Let every QR finish drawing (QRCodeImage encodes after an async import) before the
    // encode calls are read.
    await waitFor(() => expect(screen.queryAllByTestId('local-qr-code-loading')).toHaveLength(0));
    return img;
  }

  it('encodes /shared/<id> and never /w/', async () => {
    const img = await publish();
    expect(img.getAttribute('src')).toBe(SHARED_PNG);
    expect(encodedAnyShortLink()).toBe(false);
  });

  // When the receipt carries no PNG, the panel draws its own QR from the payload
  // (PublishPanel.tsx, the QRCodeImage branch). That fallback must say /shared/ too
  // (claude3's mutant M06: the fallback drawing the human /w/ link went unnoticed).
  it('draws the /shared/ payload when the receipt carries no PNG', async () => {
    toDataURL.mockResolvedValueOnce('' as never);
    const img = await publish();
    expect(img).toHaveAttribute('data-testid', 'local-qr-code');
    await waitFor(() => expect(img.getAttribute('src')).toBe(SHARED_PNG));
    expect(encodedAnyShortLink()).toBe(false);
  });
});
