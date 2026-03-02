'use client';

/**
 * PanelSplitter — a draggable resize handle between two panels.
 *
 * Supports both mouse and touch interactions for desktop and mobile use.
 * Touch targets are wider (12px) on coarse-pointer devices via CSS.
 *
 * Usage:
 *   <div style={{ width: leftPx }}>...</div>
 *   <PanelSplitter
 *     direction="horizontal"            // "horizontal" | "vertical"
 *     onDelta={(delta) => setLeftPx(w => clamp(w + delta, min, max))}
 *   />
 *   <div style={{ flex: 1 }}>...</div>
 *
 * The splitter emits a pixel delta on every mousemove/touchmove during drag.
 * The parent is responsible for clamping and applying the value.
 */

import { useCallback, useRef } from 'react';

interface Props {
  /** "horizontal" splits left/right panels; "vertical" splits top/bottom. */
  direction: 'horizontal' | 'vertical';
  /** Called with a pixel delta on every mousemove/touchmove while dragging. */
  onDelta: (delta: number) => void;
  className?: string;
}

export function PanelSplitter({ direction, onDelta, className = '' }: Props) {
  const dragging = useRef(false);
  const last     = useRef(0);

  // ── Mouse drag ─────────────────────────────────────────────────────────────
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

  // ── Touch drag (mobile/tablet support) ─────────────────────────────────────
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      dragging.current = true;
      last.current = direction === 'horizontal' ? touch.clientX : touch.clientY;

      const onTouchMove = (ev: TouchEvent) => {
        if (!dragging.current || ev.touches.length !== 1) return;
        ev.preventDefault(); // prevent scroll while dragging
        const t = ev.touches[0];
        const cur   = direction === 'horizontal' ? t.clientX : t.clientY;
        const delta = cur - last.current;
        last.current = cur;
        onDelta(delta);
      };

      const onTouchEnd = () => {
        dragging.current = false;
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
      };

      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
      window.addEventListener('touchcancel', onTouchEnd);
    },
    [direction, onDelta]
  );

  const isH = direction === 'horizontal';

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      role="separator"
      aria-orientation={isH ? 'vertical' : 'horizontal'}
      tabIndex={0}
      className={`group relative shrink-0 flex items-center justify-center transition-colors touch-none
        ${isH
          ? 'w-[5px] cursor-col-resize hover:bg-studio-accent/30 studio-splitter-h'
          : 'h-[5px] cursor-row-resize hover:bg-studio-accent/30 studio-splitter-v'}
        bg-studio-border/60
        ${className}`}
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
