// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBus } from '@/hooks/useStudioBus';
import { useSceneStore } from '@/lib/stores/sceneStore';
import { ScenePreviewPanel } from '../ScenePreviewPanel';

vi.mock('@/embed/DesktopViewer', () => ({
  DesktopViewer: ({
    code,
    showGrid,
    showPlatformReceipt,
    showStars,
  }: {
    code: string;
    showGrid: boolean;
    showPlatformReceipt: boolean;
    showStars: boolean;
  }) => (
    <div
      data-testid="desktop-viewer"
      data-code={code}
      data-show-grid={String(showGrid)}
      data-show-platform-receipt={String(showPlatformReceipt)}
      data-show-stars={String(showStars)}
    />
  ),
}));

describe('ScenePreviewPanel LOD quality control', () => {
  beforeEach(() => {
    getBus().clear();
    useSceneStore.getState().reset();
    useSceneStore.getState().setCode('scene "lod" { cube { size: 1 } }');
  });

  it('renders the LOD range without changing DesktopViewer props', () => {
    render(<ScenePreviewPanel />);

    const slider = screen.getByRole('slider', { name: 'LOD quality' }) as HTMLInputElement;
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '3');
    expect(slider).toHaveAttribute('step', '1');
    expect(slider.value).toBe('0');

    const viewer = screen.getByTestId('desktop-viewer');
    expect(viewer).toHaveAttribute('data-code', 'scene "lod" { cube { size: 1 } }');
    expect(viewer).toHaveAttribute('data-show-platform-receipt', 'false');
    expect(viewer).toHaveAttribute('data-show-stars', 'false');
    expect(viewer).toHaveAttribute('data-show-grid', 'true');
  });

  it('emits lod:updated with the selected quality tier', () => {
    render(<ScenePreviewPanel />);

    const slider = screen.getByRole('slider', { name: 'LOD quality' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '3' } });

    expect(slider.value).toBe('3');
    expect(getBus().getHistory()).toMatchObject([
      {
        channel: 'lod:updated',
        data: {
          quality: 3,
          color: '#ef4444',
          source: 'scene-preview',
        },
      },
    ]);
  });
});
