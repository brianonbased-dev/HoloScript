// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '../../../hooks/useStudioBus';
import { LODPanel } from '../LODPanel';

vi.mock('../../../hooks/useLOD', () => ({
  useLOD: () => ({
    objects: [{ id: 'tree-01', level: 0, distance: 10, transitioning: false }],
    cameraPos: [0, 0, 0],
    setCameraPos: vi.fn(),
    buildDemo: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  }),
}));

describe('LODPanel bus integration', () => {
  beforeEach(() => {
    getBus().clear();
  });

  it('applies preview quality updates from lod:updated events', () => {
    render(<LODPanel />);

    expect(screen.getByTestId('lod-level-tree-01')).toHaveTextContent('L0');

    act(() => {
      getBus().emit('lod:updated', { quality: 2, source: 'scene-preview' });
    });

    expect(screen.getByTestId('lod-level-tree-01')).toHaveTextContent('L2');
  });
});
