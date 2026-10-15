// @vitest-environment jsdom
/**
 * /earn for a signed-in user with no HoloMesh agent: #570 makes
 * /api/holomesh/dashboard/earnings answer 404 { code: 'no_holomesh_agent' }.
 * The page shows "Join HoloMesh", not "Could not load earnings data: HTTP 404".
 * Twin: fails before this change.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Octo Cat', email: 'octo@example.com' } }, status: 'authenticated' }),
}));

afterEach(() => vi.unstubAllGlobals());

function stubFetch(earnings: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).includes('/dashboard/earnings')
        ? earnings()
        : new Response(JSON.stringify({ transactions: [] }), { status: 200 })
    )
  );
}

describe('/earn no_holomesh_agent', () => {
  it('shows the Join HoloMesh state instead of an error', async () => {
    stubFetch(() => new Response(JSON.stringify({ success: false, code: 'no_holomesh_agent', error: 'x' }), { status: 404 }));
    const { default: EarnPage } = await import('../page');
    render(<EarnPage />);
    await waitFor(() => expect(screen.getByTestId('join-holomesh')).toBeTruthy());
    expect(screen.getByText('Join HoloMesh').closest('a')?.getAttribute('href')).toBe('/holomesh');
    expect(screen.getByText(/Signed in as Octo Cat/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Could not load earnings|NaN|undefined/);
  });

  it('a different 404 is still reported as an error', async () => {
    stubFetch(() => new Response('not found', { status: 404 }));
    const { default: EarnPage } = await import('../page');
    render(<EarnPage />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Could not load earnings data: HTTP 404/));
    expect(screen.queryByTestId('join-holomesh')).toBeNull();
  });
});
