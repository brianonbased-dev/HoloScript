// @vitest-environment jsdom
/** Connected apps panel: lists grants with the unverified marker; Revoke calls DELETE and removes the row. */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectedAppsPanel from '../ConnectedAppsPanel';

const grant = {
  id: 'grant_1',
  client_id: 'hsc_abc',
  client_name: 'Helper Bot',
  client_name_verified: false,
  scopes: ['tools:read', 'user:private'],
  created_at: '2026-10-16T14:00:00.000Z',
  last_used_at: '2026-10-16T15:00:00.000Z',
};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ grants: [grant] }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('ConnectedAppsPanel', () => {
  it('renders each grant with name, unverified marker, app id and plain-language scopes', async () => {
    render(<ConnectedAppsPanel />);
    expect(await screen.findByText('Helper Bot')).toBeTruthy();
    expect(screen.getByText('Unverified name')).toBeTruthy();
    expect(screen.getByText(/hsc_abc/)).toBeTruthy();
    expect(screen.getByText('See your private data (earnings, credits)')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/oauth/grants', expect.anything());
  });

  it('Revoke sends DELETE for that grant and removes the row', async () => {
    render(<ConnectedAppsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    await waitFor(() => expect(screen.queryByText('Helper Bot')).toBeNull());
    const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE');
    expect(del?.[0]).toBe('/api/oauth/grants?id=grant_1');
    expect(screen.getByText('No connected apps.')).toBeTruthy();
  });

  it('a failed revoke keeps the row and says so', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Response('{}', { status: 502 })
        : new Response(JSON.stringify({ grants: [grant] }), { status: 200 })
    );
    render(<ConnectedAppsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Helper Bot')).toBeTruthy();
  });
});
