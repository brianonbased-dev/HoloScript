// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

const { getSessionMock, redirectMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@/lib/api-auth', () => ({
  getSession: getSessionMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/components/creator', () => ({
  CreatorMode: () => <div>Creator mode authenticated</div>,
}));

import CreatorPage from './page';

describe('/creator page auth guard', () => {
  it('redirects unauthenticated users to sign-in', async () => {
    getSessionMock.mockResolvedValueOnce(null);

    await expect(CreatorPage()).rejects.toThrow('redirect:/auth/signin?callbackUrl=%2Fcreator');
    expect(redirectMock).toHaveBeenCalledWith('/auth/signin?callbackUrl=%2Fcreator');
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
