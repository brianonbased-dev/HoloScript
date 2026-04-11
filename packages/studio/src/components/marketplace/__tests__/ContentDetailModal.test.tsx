// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ContentDetailModal } from '../ContentDetailModal';

describe('ContentDetailModal', () => {
  it('renders without crashing', () => {
    const dummyItem: any = {
      id: '1',
      name: 'Test',
      description: 'Test desc',
      type: 'scene',
      category: 'misc',
      tags: [],
      version: '1.0',
      author: 'Test',
      rating: 0,
      ratingCount: 0,
      downloadCount: 0,
      viewCount: 0,
      createdAt: 0,
      updatedAt: 0,
      contentUrl: '',
    };
    const { container } = render(
      <ContentDetailModal 
        item={dummyItem} 
        onClose={() => {}} 
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );
    expect(container).toBeTruthy();
  });
});
