// @vitest-environment jsdom

/**
 * The falsifier for the phone -> QR -> headset journey.
 *
 * Measured 2026-09-16: SharePanel imported QRCodeImage zero times, so the share
 * surface a phone can reach produced a copyable link and no scannable code at
 * all. And every QR the studio DID emit encoded /w/<id>, which HoloQR
 * pattern-matches as a world-portal link (WorldPortal.kt:21) and refuses,
 * because its trusted-key list ships empty (WorldTrust.kt:31) -- the headset
 * shows "World blocked: signed-parameter-cardinality".
 *
 * These tests assert the PROPERTY, not its silhouette: not "does the file
 * import a QR component" but "what address does the QR actually encode". Revert
 * the transform in SharePanel and the second test goes red with /w/ in the
 * received argument.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import * as qrcode from 'qrcode';

vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));

const shareState = {
  publish: vi.fn(),
  gallery: [] as unknown[],
  loadGallery: vi.fn(),
  shareUrl: null as string | null,
  publishing: false,
  loadingGallery: false,
  galleryRequiresSignIn: false,
  error: null as string | null,
  reset: vi.fn(),
};

vi.mock('@/hooks/useSceneShare', () => ({
  useSceneShare: () => shareState,
}));

// SharePanel selects two fields: s.code and s.metadata (SharePanel.tsx:29-30).
// The first draft of this stub supplied only `code`, and all four cases failed on
// `sceneMetadata.name` — a fixture fault, not a product fault. Noted because a
// red test whose cause is the harness is the mirror image of a false zero.
type SceneState = { code: string; metadata: { name: string } };
vi.mock('@/lib/stores', () => ({
  useSceneStore: (selector: (s: SceneState) => unknown) =>
    selector({ code: 'scene code', metadata: { name: 'Test Scene' } }),
}));

import { SharePanel } from './SharePanel';

describe('SharePanel QR (the phone -> headset handoff)', () => {
  const toDataURL = vi.mocked(qrcode.toDataURL);

  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue('data:image/png;base64,qr-code' as never);
    shareState.shareUrl = null;
  });

  it('renders no QR before a scene is published', () => {
    render(<SharePanel onClose={() => {}} />);
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('encodes /shared/ in the QR when the share link is the /w/ short form', async () => {
    shareState.shareUrl = 'https://holoscript.studio/w/abc123';
    render(<SharePanel onClose={() => {}} />);

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    const encoded = String(toDataURL.mock.calls[0]?.[0]);

    // The whole point: HoloQR refuses /w/ and admits /shared/.
    expect(encoded).toContain('/shared/abc123');
    expect(encoded).not.toContain('/w/');
  });

  it('leaves an already-/shared/ link untouched', async () => {
    shareState.shareUrl = 'https://holoscript.studio/shared/abc123';
    render(<SharePanel onClose={() => {}} />);

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    expect(String(toDataURL.mock.calls[0]?.[0])).toBe('https://holoscript.studio/shared/abc123');
  });

  it('still shows the /w/ short link for a human to copy', async () => {
    shareState.shareUrl = 'https://holoscript.studio/w/abc123';
    render(<SharePanel onClose={() => {}} />);

    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    expect(screen.getByText('https://holoscript.studio/w/abc123')).toBeInTheDocument();
  });
});
