// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContentCard } from '../ContentCard';

const dummyItem: any = {
  id: '1',
  name: 'Test Agent',
  description: 'Test desc',
  type: 'scene',
  category: 'misc',
  tags: ['ai'],
  author: { id: 'a1', name: 'Test' },
  rating: 4.5,
  downloadCount: 42,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
  priceCents: 1500,
  cognitiveHz: 3.5,
};

describe('ContentCard', () => {
  it('renders without crashing', () => {
    render(<ContentCard item={dummyItem} onSelect={() => {}} />);
    expect(screen.getByRole('link', { name: /view test agent/i })).toBeInTheDocument();
  });

  it('verifies RTL assertions for localized price formatting', () => {
    render(<ContentCard item={dummyItem} onSelect={() => {}} />);
    // ContentCard formats priceCents / 100
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
  });

  it('validates cognitiveHz metrics tags', () => {
    render(<ContentCard item={dummyItem} onSelect={() => {}} />);
    // ContentCard renders cognitiveHz metrics
    expect(screen.getByText(/3\.5\s*Hz/i)).toBeInTheDocument();
  });

  it('triggers onSelect payload correctly', () => {
    const handleSelect = vi.fn();
    render(<ContentCard item={dummyItem} onSelect={handleSelect} />);
    screen.getByRole('link', { name: /view test agent/i }).click();
    expect(handleSelect).toHaveBeenCalledWith(dummyItem);
  });
});
