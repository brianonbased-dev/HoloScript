// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ContentCard } from '../ContentCard';
import type { MarketplaceItem } from '@/lib/marketplace/types';

const dummyItem: MarketplaceItem = {
  id: '1',
  name: 'Test',
  description: 'Test desc',
  type: 'scene',
  category: 'misc',
  tags: [],
  author: { id: 'a1', name: 'Test' },
  rating: 0,
  downloadCount: 0,
  viewCount: 0,
  createdAt: 0,
  updatedAt: 0,
};

describe('ContentCard', () => {
  it('renders without crashing', () => {
    render(<ContentCard item={dummyItem} onSelect={() => {}} />);
    expect(screen.getByRole('link', { name: /view test/i })).toBeInTheDocument();
  });
});
