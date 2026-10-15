// @vitest-environment jsdom
/**
 * Buying a premium entry without a HoloMesh agent: the purchase route answers
 * 404 { code: 'no_holomesh_agent' }. The page shows a Join HoloMesh prompt,
 * not a raw error or a crash. Twin: fails before this change.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'entry1' }) }));

afterEach(() => vi.unstubAllGlobals());

const ENTRY = {
  id: 'entry1',
  type: 'wisdom',
  content: 'teaser',
  authorName: 'a',
  authorId: 'a',
  domain: 'd',
  tags: [],
  voteCount: 0,
  commentCount: 0,
  createdAt: new Date().toISOString(),
  premium: true,
  paid: false,
  price: 1,
  provenanceHash: 'abcdef0123456789',
};

function stub(purchase: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).endsWith('/purchase')
        ? purchase()
        : new Response(JSON.stringify({ success: true, entry: ENTRY, comments: [] }), {
            status: 200,
          })
    )
  );
}

describe('/holomesh/entry/[id] buy without a HoloMesh agent', () => {
  it('shows Join HoloMesh on 404 no_holomesh_agent', async () => {
    stub(
      () =>
        new Response(
          JSON.stringify({
            success: false,
            code: 'no_holomesh_agent',
            error: 'No HoloMesh agent is linked to your account yet.',
          }),
          { status: 404 }
        )
    );
    const { default: Page } = await import('../page');
    render(<Page />);
    fireEvent.click(await screen.findByText(/Buy for/));
    await waitFor(() => expect(screen.getByTestId('buy-join-holomesh')).toBeTruthy());
    expect(screen.getByText('Join HoloMesh').closest('a')?.getAttribute('href')).toBe('/holomesh');
  });

  it('a non-JSON failure shows a message, not a crash', async () => {
    stub(() => new Response('<html>bad gateway</html>', { status: 502 }));
    const { default: Page } = await import('../page');
    render(<Page />);
    fireEvent.click(await screen.findByText(/Buy for/));
    await waitFor(() => expect(document.body.textContent).toMatch(/Purchase failed \(HTTP 502\)/));
    expect(screen.queryByTestId('buy-join-holomesh')).toBeNull();
  });
});
