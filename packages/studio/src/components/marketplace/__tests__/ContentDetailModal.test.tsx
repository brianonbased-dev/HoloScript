// @vitest-environment jsdom
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContentDetailModal } from '../ContentDetailModal';
import type { MarketplaceItem } from '@/lib/marketplace/types';

function baseItem(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'item-1',
    name: 'Agent Starter',
    description: 'Orchestrator-aligned agent template for HoloMesh.',
    author: { id: 'a1', name: 'Holo Labs' },
    type: 'template',
    category: 'templates',
    tags: ['agents', 'mesh'],
    rating: 4.2,
    downloadCount: 1200,
    viewCount: 3400,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    thumbnailUrl: '',
    ...overrides,
  };
}

const orchestratorTemplateMetrics = {
  priceCents: 999,
  rating: 4.8,
  installs: 512,
  computeMultiplier: 1.25,
  cognitiveHz: 12,
  capabilities: ['reasoning', 'tools', 'mesh-sync'],
};

describe('ContentDetailModal', () => {
  it('renders Install Template and Publish to HoloMesh for agent templates', () => {
    const item = baseItem({ templateMetrics: orchestratorTemplateMetrics });
    const onPublish = vi.fn();

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        onPublishToHoloMesh={onPublish}
        isFavorited={false}
      />
    );

    expect(screen.getByRole('button', { name: /install template/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish to holomesh/i })).toBeInTheDocument();
  });

  it('surfaces orchestrator template metrics (price, rating, installs, compute multiplier)', () => {
    const item = baseItem({ templateMetrics: orchestratorTemplateMetrics });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    const metrics = screen.getByRole('region', { name: /template metrics/i });
    expect(within(metrics).getByText('Price')).toBeInTheDocument();
    expect(within(metrics).getByText('$9.99')).toBeInTheDocument();
    expect(within(metrics).getByText('Rating')).toBeInTheDocument();
    expect(within(metrics).getByText('4.8')).toBeInTheDocument();
    expect(within(metrics).getByText('Installs')).toBeInTheDocument();
    expect(within(metrics).getByText('512')).toBeInTheDocument();
    expect(within(metrics).getByText('Compute multiplier')).toBeInTheDocument();
    expect(within(metrics).getByText('1.25×')).toBeInTheDocument();
  });

  it('renders cognitiveHz and capabilities tags from template metrics', () => {
    const item = baseItem({ templateMetrics: orchestratorTemplateMetrics });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    const hzTag = screen.getByTestId('cognitive-hz-tag');
    expect(hzTag).toHaveTextContent('12 cognitiveHz');

    const caps = screen.getAllByTestId('capability-tag');
    expect(caps).toHaveLength(3);
    expect(caps.map((el) => el.textContent)).toEqual(
      expect.arrayContaining(['reasoning', 'tools', 'mesh-sync'])
    );
  });

  it('calls onPublishToHoloMesh with the item when Publish is clicked', () => {
    const item = baseItem({ templateMetrics: orchestratorTemplateMetrics });
    const onPublish = vi.fn();

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        onPublishToHoloMesh={onPublish}
        isFavorited={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /publish to holomesh/i }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledWith(item);
  });

  it('disables Publish to HoloMesh when no handler is provided', () => {
    const item = baseItem({ templateMetrics: orchestratorTemplateMetrics });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    expect(screen.getByRole('button', { name: /publish to holomesh/i })).toBeDisabled();
  });

  it('shows Publish to HoloMesh for non-template content when templateMetrics exist', () => {
    const item = baseItem({
      type: 'scene',
      templateMetrics: orchestratorTemplateMetrics,
    });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    expect(screen.getByRole('button', { name: /^install$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish to holomesh/i })).toBeInTheDocument();
  });

  it('does not render HoloMesh agent profile section when cognitiveHz and capabilities are absent', () => {
    const item = baseItem({
      templateMetrics: {
        priceCents: 500,
        rating: 4.4,
        installs: 42,
        computeMultiplier: 1,
      },
    });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    expect(screen.queryByRole('heading', { name: /holomesh agent profile/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('cognitive-hz-tag')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('capability-tag')).toHaveLength(0);
  });

  it('formats zero-valued metrics correctly (price and compute multiplier)', () => {
    const item = baseItem({
      templateMetrics: {
        priceCents: 0,
        rating: 0,
        installs: 0,
        computeMultiplier: 0,
        capabilities: [],
      },
    });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    const metrics = screen.getByRole('region', { name: /template metrics/i });
    expect(within(metrics).getByText('$0.00')).toBeInTheDocument();
    expect(within(metrics).getByText('0.00×')).toBeInTheDocument();
    expect(within(metrics).getByText('0')).toBeInTheDocument();
  });

  it('uses Install (not Install Template) for non-template content', () => {
    const item = baseItem({
      type: 'scene',
      templateMetrics: undefined,
    });

    render(
      <ContentDetailModal
        item={item}
        onClose={() => {}}
        onDownload={() => {}}
        onFavorite={() => {}}
        isFavorited={false}
      />
    );

    expect(screen.getByRole('button', { name: /^install$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install template/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish to holomesh/i })).not.toBeInTheDocument();
  });
});
