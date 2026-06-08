// @vitest-environment jsdom

/**
 * HoloSurfaceRenderer — list/repeat node coverage.
 *
 * The keystone of the native-surface program: a composition can now render a
 * data-bound list (project cards, history rows, asset grids) by iterating a
 * state array and rendering child nodes as a per-item template — with each
 * item's fields bound into the row ($name → item.name) and a per-row emit that
 * carries the item as payload. This is what lets surface BODIES be authored in
 * HoloScript instead of hand-written TSX. (board task_1780466651238_x2a4)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { HoloSurfaceRenderer } from '../HoloSurfaceRenderer';

// Minimal HSPlusNode-shaped fixtures (name/type/properties/children).
function listComposition() {
  return [
    {
      name: 'ProjectList',
      type: 'ui',
      properties: { uiType: 'list', items: '$projects' },
      children: [
        {
          name: 'Card',
          type: 'ui',
          properties: { uiType: 'button', text: '$name', onClick: 'open' },
          children: [],
        },
      ],
    },
  ] as unknown as Parameters<typeof HoloSurfaceRenderer>[0]['nodes'];
}

describe('HoloSurfaceRenderer — list/repeat', () => {
  it('renders one row per item with item-bound text', () => {
    render(
      <HoloSurfaceRenderer
        nodes={listComposition()}
        state={{ projects: [{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }] }}
      />
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renders nothing for an empty / missing array (no throw)', () => {
    const { container } = render(
      <HoloSurfaceRenderer nodes={listComposition()} state={{ projects: [] }} />
    );
    expect(container.querySelector('[data-holo-list]')).toBeInTheDocument();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('emits the row event WITH the item as payload on click', () => {
    const onEmit = vi.fn();
    render(
      <HoloSurfaceRenderer
        nodes={listComposition()}
        state={{
          projects: [
            { name: 'Alpha', id: 'a1' },
            { name: 'Beta', id: 'b2' },
          ],
        }}
        onEmit={onEmit}
      />
    );
    fireEvent.click(screen.getByText('Beta'));
    expect(onEmit).toHaveBeenCalledWith('open', { name: 'Beta', id: 'b2' });
  });

  it('exposes $index to the row template', () => {
    const nodes = [
      {
        name: 'L',
        type: 'ui',
        properties: { uiType: 'repeat', items: '$rows' },
        children: [
          { name: 'T', type: 'ui', properties: { uiType: 'text', text: '$index' }, children: [] },
        ],
      },
    ] as unknown as Parameters<typeof HoloSurfaceRenderer>[0]['nodes'];
    render(<HoloSurfaceRenderer nodes={nodes} state={{ rows: [{}, {}] }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
