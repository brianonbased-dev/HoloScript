// @vitest-environment jsdom
/**
 * Proof: SignInCta renders a visible control that points at /auth/signin when
 * the session is empty / unauthenticated (founder smoke gap 2026-10-05).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
}));

import { SignInCta } from '../SignInCta';

describe('SignInCta', () => {
  it('renders a Sign in control that links to /auth/signin', () => {
    render(<SignInCta />);

    const link = screen.getByTestId('sign-in-cta');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe(
      '/auth/signin?callbackUrl=%2Fsettings'
    );
    expect(link.textContent).toMatch(/Sign in/i);
  });

  it('honors callbackUrl override', () => {
    render(<SignInCta callbackUrl="/projects" label="Continue with GitHub" />);

    const link = screen.getByTestId('sign-in-cta');
    expect(link.getAttribute('href')).toBe(
      '/auth/signin?callbackUrl=%2Fprojects'
    );
    expect(link.textContent).toBe('Continue with GitHub');
  });
});
