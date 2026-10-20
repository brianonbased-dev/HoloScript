// @vitest-environment jsdom
/**
 * Proof: Settings gated empty states render a Sign in CTA when session is empty.
 * Full SettingsView pulls HoloSurface + Stripe/Oracle; this stubs those and
 * asserts the Profile fallback CTA is visible.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
  signIn: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings',
}));

vi.mock('@/components/holo-surface', () => ({
  HoloSurfaceRenderer: () => null,
  useHoloComposition: () => ({
    loading: true,
    error: null,
    nodes: [],
    state: {},
    computed: {},
    templates: {},
    setState: vi.fn(),
  }),
}));

vi.mock('../BrittneyAPIKeysPanel', () => ({ default: () => null }));
vi.mock('@/components/integrations/IntegrationsView', () => ({
  IntegrationsView: () => null,
}));
vi.mock('@/app/absorb/components', () => ({
  CreditBalanceCard: () => null,
  PricingTab: () => null,
}));
vi.mock('@/lib/absorb/fetchWithAuth', () => ({ absorbFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { SettingsView } from '../SettingsView';

beforeEach(() => {
  mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
});

describe('SettingsView sign-in empty state', () => {
  it('shows a Sign in CTA on the Profile tab when session is empty', () => {
    render(<SettingsView />);

    expect(screen.getByText(/Please sign in to access settings/i)).toBeTruthy();
    const cta = screen.getByTestId('sign-in-cta');
    expect(cta.getAttribute('href')).toContain('/auth/signin');
  });
});
