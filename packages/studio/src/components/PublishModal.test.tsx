// @vitest-environment jsdom

/**
 * The publish screen's QR, the second half of the phone -> QR -> headset journey.
 *
 * PR #308 fixed SharePanel's QR to encode /shared/<id>, because HoloQR refuses a
 * /w/<id> world link (WorldPortal.kt:21 pattern-matches it as a portal, WorldTrust.kt:31
 * ships an empty trusted-key list). The independent review of that PR found the same
 * fault surviving here: PublishModal built `${base}/w/${id}` and drew its QR from it.
 * This test asserts the property on THIS screen: what address the QR encodes after a
 * publish, with the /w/ link still shown for a human to copy.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as qrcode from 'qrcode';

vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));

type SceneState = { code: string; metadata: { name: string } };
vi.mock('@/lib/stores', () => ({
  useSceneStore: (selector: (s: SceneState) => unknown) =>
    selector({ code: 'scene code', metadata: { name: 'Test Scene' } }),
}));

import { PublishModal } from './PublishModal';

describe('PublishModal QR (the phone -> headset handoff, publish screen)', () => {
  const toDataURL = vi.mocked(qrcode.toDataURL);

  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue('data:image/png;base64,qr-code' as never);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'abc123', url: 'https://holoscript.studio/shared/abc123' }),
    })));
  });

  it('encodes /shared/ in the QR after a publish, and still shows the /w/ short link to copy', async () => {
    render(<PublishModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /publish now/i }));

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    const encoded = String(toDataURL.mock.calls[0]?.[0]);
    expect(encoded).toContain('/shared/abc123');
    expect(encoded).not.toContain('/w/');
    // The copyable link keeps the short form.
    expect(screen.getByText(`${window.location.origin}/w/abc123`)).toBeInTheDocument();
  });
});
