// @vitest-environment jsdom

/**
 * HoloSurfaceRenderer — native page-body primitives.
 *
 * The keystone (list/repeat) lets rows be data-bound; a real page body also
 * needs (a) conditional visibility so loading/empty/populated states are
 * authored natively, and (b) flow layout so cards stack and row internals lay
 * out responsively. Both ship with the /projects body conversion (board
 * c-clgo) and are reused by every native page body that follows.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { HoloSurfaceRenderer } from '../HoloSurfaceRenderer';

type Nodes = Parameters<typeof HoloSurfaceRenderer>[0]['nodes'];

describe('HoloSurfaceRenderer — visible gating', () => {
  const nodes = [
    {
      name: 'Empty',
      type: 'ui',
      properties: { uiType: 'text', text: 'No projects', visible: '$showEmpty' },
      children: [],
    },
    {
      name: 'List',
      type: 'ui',
      properties: { uiType: 'text', text: 'Has projects', visible: '$showList' },
      children: [],
    },
  ] as unknown as Nodes;

  it('renders only the node whose visible flag is truthy', () => {
    render(<HoloSurfaceRenderer nodes={nodes} state={{ showEmpty: true, showList: false }} />);
    expect(screen.getByText('No projects')).toBeInTheDocument();
    expect(screen.queryByText('Has projects')).not.toBeInTheDocument();
  });

  it('flips with state — list shows, empty hides', () => {
    render(<HoloSurfaceRenderer nodes={nodes} state={{ showEmpty: false, showList: true }} />);
    expect(screen.queryByText('No projects')).not.toBeInTheDocument();
    expect(screen.getByText('Has projects')).toBeInTheDocument();
  });

  it('a node with no visible prop always renders', () => {
    const always = [
      { name: 'A', type: 'ui', properties: { uiType: 'text', text: 'Always' }, children: [] },
    ] as unknown as Nodes;
    render(<HoloSurfaceRenderer nodes={always} state={{}} />);
    expect(screen.getByText('Always')).toBeInTheDocument();
  });
});

describe('HoloSurfaceRenderer — flow layout', () => {
  it('direction: column → display:flex, flex-direction:column', () => {
    const nodes = [
      {
        name: 'Col',
        type: 'ui',
        properties: { uiType: 'panel', direction: 'column', gap: 12 },
        children: [],
      },
    ] as unknown as Nodes;
    const { container } = render(<HoloSurfaceRenderer nodes={nodes} state={{}} />);
    const el = container.querySelector('[data-holo-node="Col"]') as HTMLElement;
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('column');
    expect(el.style.gap).toBe('12px');
  });

  it('grow + align + justify map to flex CSS', () => {
    const nodes = [
      {
        name: 'Row',
        type: 'ui',
        properties: {
          uiType: 'panel',
          direction: 'row',
          align: 'center',
          justify: 'space-between',
          grow: 1,
        },
        children: [],
      },
    ] as unknown as Nodes;
    const { container } = render(<HoloSurfaceRenderer nodes={nodes} state={{}} />);
    const el = container.querySelector('[data-holo-node="Row"]') as HTMLElement;
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('row');
    expect(el.style.alignItems).toBe('center');
    expect(el.style.justifyContent).toBe('space-between');
    expect(el.style.flexGrow).toBe('1');
  });

  it('a list container honors layout props (column + gap)', () => {
    const nodes = [
      {
        name: 'L',
        type: 'ui',
        properties: { uiType: 'list', items: '$rows', direction: 'column', gap: 8 },
        children: [
          { name: 'T', type: 'ui', properties: { uiType: 'text', text: '$name' }, children: [] },
        ],
      },
    ] as unknown as Nodes;
    const { container } = render(
      <HoloSurfaceRenderer nodes={nodes} state={{ rows: [{ name: 'A' }, { name: 'B' }] }} />
    );
    const el = container.querySelector('[data-holo-list]') as HTMLElement;
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('column');
    expect(el.style.gap).toBe('8px');
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
