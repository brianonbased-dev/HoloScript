// @vitest-environment jsdom
/**
 * Proof: main nav shows a visible Sign in control when the session is
 * null/empty (founder smoke: Settings / Projects / home had none).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
}));

import { GlobalNavigation } from '../GlobalNavigation';

afterEach(() => {
  mockUseSession.mockReset();
});

describe('GlobalNavigation sign-in honesty', () => {
  it('shows Sign in when session is null / unauthenticated', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });

    render(<GlobalNavigation />);

    const cta = screen.getByTestId('sign-in-cta');
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('href')).toContain('/auth/signin');
    expect(cta.textContent).toMatch(/Sign in/i);
  });

  it('shows Sign in when session is empty object (no user)', () => {
    mockUseSession.mockReturnValue({ data: {}, status: 'unauthenticated' });

    render(<GlobalNavigation />);

    expect(screen.getByTestId('sign-in-cta')).toBeTruthy();
  });

  it('hides Sign in while session is loading', () => {
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });

    render(<GlobalNavigation />);

    expect(screen.queryByTestId('sign-in-cta')).toBeNull();
  });

  it('hides Sign in when authenticated with a user', () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', name: 'Joseph', email: 'j@example.com' } },
      status: 'authenticated',
    });

    render(<GlobalNavigation />);

    expect(screen.queryByTestId('sign-in-cta')).toBeNull();
  });
});
