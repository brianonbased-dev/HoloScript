// @vitest-environment jsdom
/**
 * /api/agents/fleet/[id] answers 404 { code: 'no_holomesh_agent' } for a caller
 * with no HoloMesh agent (#577). The tab shows Join HoloMesh, not "HTTP 404".
 * Twin: fails before this change.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MyAgentsTab } from '../MyAgentsTab';

afterEach(() => vi.unstubAllGlobals());

const AGENT = {
  id: 'a1',
  name: 'Bot',
  platform: 'holomesh',
  status: 'active',
  reputation: 0,
  earningsCents: 0,
  spentCents: 0,
  lastAction: '',
  lastActionAt: null,
  bio: '',
  personalityMode: 'engineer',
  skills: [],
  maxDailySpendCents: 100,
  rateLimitPerMin: 10,
  creatorRevenueSplit: 80,
  createdAt: new Date().toISOString(),
};

function stub(patch: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).endsWith('/api/agents/fleet')
        ? new Response(JSON.stringify({ agents: [AGENT] }), { status: 200 })
        : patch()
    )
  );
}

describe('MyAgentsTab no_holomesh_agent', () => {
  it('Pause on a 404 no_holomesh_agent shows Join HoloMesh', async () => {
    stub(
      () =>
        new Response(JSON.stringify({ success: false, code: 'no_holomesh_agent', error: 'x' }), {
          status: 404,
        })
    );
    render(<MyAgentsTab />);
    fireEvent.click(await screen.findByText('Pause'));
    await waitFor(() => expect(screen.getByTestId('join-holomesh')).toBeTruthy());
    expect(screen.getByText('Join HoloMesh').closest('a')?.getAttribute('href')).toBe('/holomesh');
    expect(document.body.textContent).not.toMatch(/HTTP 404/);
  });

  it('a different failure is still reported as an error', async () => {
    stub(() => new Response('boom', { status: 500 }));
    render(<MyAgentsTab />);
    fireEvent.click(await screen.findByText('Pause'));
    await waitFor(() => expect(document.body.textContent).toMatch(/HTTP 500/));
    expect(screen.queryByTestId('join-holomesh')).toBeNull();
  });
});
