'use client';

/**
 * PanelSplitter — a draggable resize handle between two panels.
 *
 * Usage:
 *   <div style={{ width: leftPx }}>...</div>
 *   <PanelSplitter
 *     direction="horizontal"            // "horizontal" | "vertical"
 *     onDelta={(delta) => setLeftPx(w => clamp(w + delta, min, max))}
 *   />
 *   <div style={{ flex: 1 }}>...</div>
 *
 * The splitter emits a pixel delta on every mousemove during drag.
 * The parent is responsible for clamping and applying the value.
 */

import { useCallback, useRef } from 'react';

interface Props {
  /** "horizontal" splits left/right panels; "vertical" splits top/bottom. */
  direction: 'horizontal' | 'vertical';
  /** Called with a pixel delta on every mousemove while dragging. */
  onDelta: (delta: number) => void;
  className?: string;
}

export function PanelSplitter({ direction, onDelta, className = '' }: Props) {
  const dragging = useRef(false);
  const last     = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      last.current = direction === 'horizontal' ? e.clientX : e.clientY;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const cur   = direction === 'horizontal' ? ev.clientX : ev.clientY;
        const delta = cur - last.current;
        last.current = cur;
        onDelta(delta);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor    = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [direction, onDelta]
  );

  const isH = direction === 'horizontal';

  return (
    <div
      onMouseDown={onMouseDown}
      className={`group relative shrink-0 flex items-center justify-center transition-colors
        ${isH
          ? 'w-[5px] cursor-col-resize hover:bg-studio-accent/30'
          : 'h-[5px] cursor-row-resize hover:bg-studio-accent/30'}
        bg-studio-border/60
        ${className}`}
      aria-hidden="true"
    >
      {/* Visual grip dots */}
      <div
        className={`flex gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity
          ${isH ? 'flex-col' : 'flex-row'}`}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-1 w-1 rounded-full bg-studio-accent/70" />
        ))}
      </div>
    </div>
  );
}
