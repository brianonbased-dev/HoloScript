// @vitest-environment jsdom
/**
 * Session-truth regression tests (founder repro 2026-06-11: panel showed
 * GitHub "Disconnected" while the user was signed in with GitHub and every
 * /api/github/* route worked). A GitHub OAuth session must surface as
 * Connected even when the per-browser connector store has nothing.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

// EventSource is not implemented in jsdom — the store's activity stream
// must not crash the render.
vi.stubGlobal(
  'EventSource',
  class {
    onmessage: unknown = null;
    onerror: unknown = null;
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
);

import { ServiceConnectorPanel } from '../ServiceConnectorPanel';
import { ConnectorStatusOverview } from '../ConnectorStatusOverview';

afterEach(() => {
  mockUseSession.mockReset();
});

describe('ServiceConnectorPanel session truth', () => {
  it('shows GitHub as connected via sign-in when the session is a GitHub OAuth session', () => {
    mockUseSession.mockReturnValue({
      data: {
        githubConnected: true,
        user: { githubUsername: 'brianonbased-dev' },
      },
      status: 'authenticated',
    });

    render(<ServiceConnectorPanel onClose={() => {}} />);

    expect(screen.getByText(/Connected via GitHub sign-in as brianonbased-dev/i)).toBeTruthy();
    expect(screen.getByText(/no token setup needed/i)).toBeTruthy();
  });

  it('shows GitHub as disconnected when signed out and the store is empty', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });

    render(<ServiceConnectorPanel onClose={() => {}} />);

    expect(screen.queryByText(/Connected via GitHub sign-in/i)).toBeNull();
  });
});

describe('ConnectorStatusOverview session truth', () => {
  it('counts GitHub as connected when the session is a GitHub OAuth session', () => {
    mockUseSession.mockReturnValue({
      data: { githubConnected: true, user: { githubUsername: 'brianonbased-dev' } },
      status: 'authenticated',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ checkedAt: '', summary: {}, infra: [] }),
      }))
    );

    render(<ConnectorStatusOverview />);

    expect(screen.getByText(/1\/6 connectors connected/i)).toBeTruthy();
  });
});
