// @vitest-environment jsdom
/**
 * Connected apps, now compiled from src/lib/studio/fragments/connectedApps.holo. Same behavior
 * as the hand-written panel it replaced, plus the spec r3 confirm gate on Revoke (DELETE).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectedAppsComponent } from '@/components/panels/native/connectedApps.native';

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
let confirmMock: ReturnType<typeof vi.fn>;
const grants = (list: unknown[]) => new Response(JSON.stringify({ grants: list }), { status: 200 });

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'DELETE' ? new Response(null, { status: 204 }) : grants([grant])
  );
  vi.stubGlobal('fetch', fetchMock);
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
});
afterEach(() => vi.unstubAllGlobals());

const deletes = () => fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE');

describe('ConnectedApps (native)', () => {
  it('renders each grant with name, unverified marker, app id and plain-language scopes', async () => {
    render(<ConnectedAppsComponent />);
    expect(await screen.findByText('Helper Bot')).toBeTruthy();
    expect(screen.getByText('Unverified name')).toBeTruthy();
    expect(screen.getByText(/hsc_abc/)).toBeTruthy();
    expect(screen.getByText('See your private data (earnings, credits)')).toBeTruthy();
    expect(screen.getByTestId('connected-apps')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/oauth/grants',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('warns when an app name mimics HoloScript or a known app (confusables folded)', async () => {
    fetchMock.mockImplementation(async () =>
      grants([{ ...grant, id: 'grant_2', client_name: 'HoIoScript Offici\u0430l' }])
    );
    render(<ConnectedAppsComponent />);
    expect(await screen.findByText(/Looks like HoloScript, but not verified/)).toBeTruthy();
  });

  it('no lookalike warning for an ordinary name', async () => {
    render(<ConnectedAppsComponent />);
    await screen.findByText('Helper Bot');
    expect(screen.queryByText(/Looks like/)).toBeNull();
  });

  it('shows the empty state when there are no grants', async () => {
    fetchMock.mockImplementation(async () => grants([]));
    render(<ConnectedAppsComponent />);
    expect(await screen.findByText('No connected apps.')).toBeTruthy();
  });

  it('a failed load shows an alert', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    render(<ConnectedAppsComponent />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      "Couldn't load your connected apps"
    );
  });

  it('Revoke asks first, then sends DELETE for that grant and removes the row', async () => {
    render(<ConnectedAppsComponent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    await waitFor(() => expect(screen.queryByText('Helper Bot')).toBeNull());
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(deletes()[0]?.[0]).toBe('/api/oauth/grants?id=grant_1');
    expect(screen.getByText('No connected apps.')).toBeTruthy();
  });

  it('MUST NOT revoke when the confirm is declined', async () => {
    confirmMock.mockReturnValue(false);
    render(<ConnectedAppsComponent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(deletes()).toHaveLength(0);
    expect(screen.getByText('Helper Bot')).toBeTruthy();
  });

  it('encodes the id into the DELETE url', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : grants([{ ...grant, id: 'a&b/../x' }])
    );
    render(<ConnectedAppsComponent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0][0]).toBe('/api/oauth/grants?id=a%26b%2F..%2Fx');
  });

  it('a failed revoke keeps the row and says so', async () => {
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Response('{}', { status: 502 }) : grants([grant])
    );
    render(<ConnectedAppsComponent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't revoke that app");
    expect(screen.getByText('Helper Bot')).toBeTruthy();
  });

  it('unmounting while a revoke is pending does not update state', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation((_u: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Promise<Response>((res) => (release = res))
        : Promise.resolve(grants([grant]))
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(<ConnectedAppsComponent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Helper Bot' }));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    view.unmount();
    await act(async () => release(new Response(null, { status: 204 })));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});