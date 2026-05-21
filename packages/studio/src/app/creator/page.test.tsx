// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getSession: getSessionMock,
}));

vi.mock('@/components/creator', () => ({
  CreatorMode: () => <div>Creator mode authenticated</div>,
}));

vi.mock('@/components/auth/SignInView', () => ({
  SignInView: () => <div>Creator sign-in required</div>,
}));

import CreatorPage from './page';

describe('/creator page auth guard', () => {
  it('renders sign-in required view for unauthenticated users', async () => {
    getSessionMock.mockResolvedValueOnce(null);

    render(await CreatorPage());

    expect(screen.getByText('Creator sign-in required')).toBeInTheDocument();
  });

  it('renders sign-in required view when auth resolution stalls', async () => {
    vi.useFakeTimers();
    getSessionMock.mockReturnValueOnce(new Promise(() => undefined));

    const page = CreatorPage();
    await vi.advanceTimersByTimeAsync(1500);
    render(await page);

    expect(screen.getByText('Creator sign-in required')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('renders creator mode for authenticated users', async () => {
    getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'user@example.com',
      },
    });

    render(await CreatorPage());

    expect(screen.getByText('Creator mode authenticated')).toBeInTheDocument();
  });
});
