// @vitest-environment jsdom
/**
 * POST /api/holomesh/team/[id]/mode answers 404 { code: 'no_holomesh_agent' }
 * for a caller with no HoloMesh agent (#577). The panel shows Join HoloMesh,
 * not "mode switch 404". Twin: fails before this change.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModePanel } from '../ModePanel';

afterEach(() => vi.unstubAllGlobals());

function stub(post: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? post()
        : new Response(JSON.stringify({ team: { mode: 'build' } }), { status: 200 })
    )
  );
}

describe('ModePanel no_holomesh_agent', () => {
  it('switching on a 404 no_holomesh_agent shows Join HoloMesh', async () => {
    stub(
      () =>
        new Response(JSON.stringify({ success: false, code: 'no_holomesh_agent', error: 'x' }), {
          status: 404,
        })
    );
    render(<ModePanel />);
    fireEvent.click(await screen.findByText('AUDIT'));
    await waitFor(() => expect(screen.getByTestId('join-holomesh')).toBeTruthy());
    expect(screen.getByText('Join HoloMesh').closest('a')?.getAttribute('href')).toBe('/holomesh');
    expect(document.body.textContent).not.toMatch(/mode switch 404/);
  });

  it('a different failure is still reported as an error', async () => {
    stub(() => new Response('boom', { status: 500 }));
    render(<ModePanel />);
    fireEvent.click(await screen.findByText('AUDIT'));
    await waitFor(() => expect(document.body.textContent).toMatch(/mode switch 500/));
    expect(screen.queryByTestId('join-holomesh')).toBeNull();
  });
});
