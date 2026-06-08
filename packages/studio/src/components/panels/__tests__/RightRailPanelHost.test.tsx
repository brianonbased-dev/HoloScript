// @vitest-environment jsdom

/**
 * RightRailPanelHost — verifies the descriptor-driven right rail that replaced
 * the ~40 hand-rolled `{xOpen && (<>…</>)}` blocks in app/create/page.tsx.
 *
 * The host imports only @holoscript/ui (ErrorBoundary, PanelSplitter), so this
 * test exercises its real layout logic without pulling the heavy
 * core/r3f-renderer graph. It locks the behaviour the cutover must preserve:
 * closed panels stay unmounted, resizable panels get a splitter + the shared
 * width, fixed panels get a bordered fixed-px rail with no splitter, the
 * error-boundary wrapper keeps content visible, and descriptor order is the
 * left-to-right render order.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { RightRailPanelHost, type RightRailPanelDescriptor } from '../RightRailPanelHost';

function renderHost(descriptors: RightRailPanelDescriptor[], rightPanelW = 288) {
  const setRightPanelW = vi.fn();
  const utils = render(
    <div>
      <RightRailPanelHost
        descriptors={descriptors}
        rightPanelW={rightPanelW}
        setRightPanelW={setRightPanelW}
      />
    </div>
  );
  return { ...utils, setRightPanelW };
}

describe('RightRailPanelHost', () => {
  it('mounts only the open descriptors', () => {
    renderHost([
      { id: 'a', open: true, width: 'resizable', content: <div>panel-a</div> },
      { id: 'b', open: false, width: 'resizable', content: <div>panel-b</div> },
      { id: 'c', open: true, width: 320, content: <div>panel-c</div> },
    ]);
    expect(screen.getByText('panel-a')).toBeInTheDocument();
    expect(screen.queryByText('panel-b')).not.toBeInTheDocument();
    expect(screen.getByText('panel-c')).toBeInTheDocument();
  });

  it('renders a resizable panel with a splitter and the shared width, no left border', () => {
    const { container } = renderHost(
      [{ id: 'a', open: true, width: 'resizable', content: <div>resizable</div> }],
      412
    );
    // PanelSplitter renders a role="separator" drag handle.
    expect(container.querySelector('[role="separator"]')).toBeInTheDocument();
    const panel = screen.getByText('resizable').parentElement as HTMLElement;
    expect(panel.style.width).toBe('412px');
    expect(panel.className).not.toContain('border-l');
  });

  it('renders a fixed-width panel with a bordered fixed-px rail and no splitter', () => {
    const { container } = renderHost([
      { id: 'a', open: true, width: 640, content: <div>fixed</div> },
    ]);
    expect(container.querySelector('[role="separator"]')).not.toBeInTheDocument();
    const panel = screen.getByText('fixed').parentElement as HTMLElement;
    expect(panel.style.width).toBe('640px');
    expect(panel.className).toContain('border-l');
  });

  it('applies containerClassName (e.g. elevated governance panels)', () => {
    renderHost([
      {
        id: 'gov',
        open: true,
        width: 320,
        containerClassName: 'bg-slate-900 z-20',
        content: <div>gov</div>,
      },
    ]);
    const panel = screen.getByText('gov').parentElement as HTMLElement;
    expect(panel.className).toContain('bg-slate-900');
    expect(panel.className).toContain('z-20');
  });

  it('keeps content visible when wrapped in an error boundary', () => {
    renderHost([
      {
        id: 'a',
        open: true,
        width: 288,
        errorLabel: 'Node Inspector',
        content: <div>boundaried</div>,
      },
    ]);
    expect(screen.getByText('boundaried')).toBeInTheDocument();
  });

  it('preserves descriptor order as left-to-right render order', () => {
    renderHost([
      { id: 'first', open: true, width: 'resizable', content: <div>first</div> },
      { id: 'second', open: true, width: 320, content: <div>second</div> },
      { id: 'third', open: true, width: 'resizable', content: <div>third</div> },
    ]);
    const texts = screen.getAllByText(/first|second|third/).map((el) => el.textContent);
    expect(texts).toEqual(['first', 'second', 'third']);
  });
});
