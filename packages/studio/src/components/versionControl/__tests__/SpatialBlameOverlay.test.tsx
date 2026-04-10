// @vitest-environment jsdom
/**
 * SpatialBlameOverlay.test.tsx
 *
 * Unit tests for the SpatialBlameOverlay React component.
 * Persona: Mia — Studio engineer verifying blame popover behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { SpatialBlameOverlay } from '@/components/versionControl/SpatialBlameOverlay';
import * as blameService from '@/features/versionControl/gitBlameService';

const mockEntry = {
  line: 42,
  hash: 'abc1234567890123456789012345678901234567',
  shortHash: 'abc1234',
  author: 'brian',
  email: 'brian@holoscript.dev',
  date: '2026-03-10',
  summary: 'feat: add @breakable physics trait',
  filePath: 'scenes/my-world.holo',
};

describe('SpatialBlameOverlay', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockClear();
  });

  it('renders loading state initially', () => {
    vi.spyOn(blameService, 'fetchBlame').mockReturnValue(new Promise(() => {}));
    render(
      <SpatialBlameOverlay
        filePath="scenes/my-world.holo"
        line={42}
        traitLabel="@breakable"
        onClose={onClose}
      />
    );
    expect(screen.getByText(/fetching blame/i)).toBeTruthy();
  });

  it('renders blame entry after successful fetch', async () => {
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValue({
      ok: true,
      entries: [mockEntry],
    });
    render(
      <SpatialBlameOverlay
        filePath="scenes/my-world.holo"
        line={42}
        traitLabel="@breakable"
        onClose={onClose}
      />
    );
    await waitFor(() => expect(screen.getByText('abc1234')).toBeTruthy());
    expect(screen.getByText('feat: add @breakable physics trait')).toBeTruthy();
    expect(screen.getByText('brian')).toBeTruthy();
    expect(screen.getByText('2026-03-10')).toBeTruthy();
  });

  it('shows the trait label in the header when provided', () => {
    vi.spyOn(blameService, 'fetchBlame').mockReturnValue(new Promise(() => {}));
    render(
      <SpatialBlameOverlay
        filePath="scenes/my-world.holo"
        line={42}
        traitLabel="@breakable"
        onClose={onClose}
      />
    );
    expect(screen.getByText('@breakable')).toBeTruthy();
  });

  it('shows mock badge when isMock=true', async () => {
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValue({
      ok: true,
      entries: [mockEntry],
      isMock: true,
    });
    render(<SpatialBlameOverlay filePath="no-git/file.holo" line={1} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/mock data/i)).toBeTruthy());
  });

  it('shows error state when fetchBlame returns ok=false', async () => {
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValue({
      ok: false,
      entries: [],
      error: 'not a git repository',
    });
    render(<SpatialBlameOverlay filePath="scenes/my-world.holo" line={1} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/not a git repository/i)).toBeTruthy());
  });

  it('calls onClose when the close button is clicked', async () => {
    vi.spyOn(blameService, 'fetchBlame').mockResolvedValue({
      ok: true,
      entries: [mockEntry],
    });
    render(<SpatialBlameOverlay filePath="scenes/my-world.holo" line={42} onClose={onClose} />);
    await waitFor(() => screen.getByText('abc1234'));
    const closeBtn = screen.getAllByRole('button')[0];
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
