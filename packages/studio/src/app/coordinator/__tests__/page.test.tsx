// @vitest-environment jsdom
/**
 * Smoke test for /coordinator route. Verifies the page.tsx file parses,
 * imports resolve, and the component renders the 4 panel sections
 * without throwing. Doesn't exercise Next.js routing or the
 * useSearchParams hook (mocked via test-only override).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

// next/navigation is mocked because it requires a Next.js request scope
// at runtime that the vitest environment doesn't provide.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import CoordinatorPage from '../page';

describe('/coordinator page route', () => {
  it('renders the 4 panel section headings', () => {
    render(<CoordinatorPage />);
    expect(screen.getByText('Coordinator')).toBeInTheDocument();
    expect(screen.getByText(/AdminDashboard/)).toBeInTheDocument();
    expect(screen.getByText(/LocomotionDemoPanel/)).toBeInTheDocument();
    expect(screen.getByText(/LobbyPeerRoster/)).toBeInTheDocument();
  });

  it('does not render demo controls when ?demo=1 is absent', () => {
    render(<CoordinatorPage />);
    expect(screen.queryByText(/Demo · tick/)).toBeNull();
  });

  it('renders demo controls when ?demo=1 is present', async () => {
    // Re-import the module with a different mock for useSearchParams.
    vi.doMock('next/navigation', () => ({
      useSearchParams: () => new URLSearchParams('demo=1'),
    }));
    vi.resetModules();
    const { default: CoordinatorPageDemo } = await import('../page');
    render(<CoordinatorPageDemo />);
    expect(screen.getByText(/Demo · tick/)).toBeInTheDocument();
    expect(screen.getByText('+ Asset load')).toBeInTheDocument();
    expect(screen.getByText('+ Auth + RBAC')).toBeInTheDocument();
    expect(screen.getByText('+ Gen-AI job')).toBeInTheDocument();
    expect(screen.getByText('+ Presence')).toBeInTheDocument();
  });
});
