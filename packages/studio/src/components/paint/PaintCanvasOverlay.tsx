'use client';

/**
 * PaintCanvasOverlay — 2D canvas that renders on top of the 3D viewport
 * to provide texture painting interaction feedback.
 *
 * This component bridges the useTexturePaint hook with pointer events,
 * providing a visual brush cursor and stroke preview. Actual UV-mapped
 * painting happens through the hook's paintAtUV() method.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTexturePaint, type PaintSettings } from '@/hooks/useTexturePaint';

interface PaintCanvasOverlayProps {
  /** Whether paint mode is active */
  active: boolean;
  /** Current paint settings from the toolbar/panel */
  settings?: Partial<PaintSettings>;
}

export function PaintCanvasOverlay({ active, settings }: PaintCanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    isPainting,
    settings: hookSettings,
    startPainting,
    stopPainting,
    paintAtUV,
    updateSettings,
    ensureCanvas,
  } = useTexturePaint();

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  // Sync external settings into the hook
  useEffect(() => {
    if (settings) updateSettings(settings);
  }, [settings, updateSettings]);

  // Initialize canvas texture on mount when active
  useEffect(() => {
    if (active) ensureCanvas();
  }, [active, ensureCanvas]);

  // Draw brush cursor on the overlay canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cursor || !active) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Brush cursor circle
    const radius = hookSettings.size / 2;
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = isPainting ? hookSettings.color : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash(isPainting ? [] : [4, 4]);
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  }, [cursor, active, isPainting, hookSettings]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      e.preventDefault();
      startPainting();
      // Normalize to UV (0-1) based on overlay position
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      paintAtUV(u, v);
    },
    [active, startPainting, paintAtUV]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!active) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      if (isPainting) {
        const u = (e.clientX - rect.left) / rect.width;
        const v = (e.clientY - rect.top) / rect.height;
        paintAtUV(u, v);
      }
    },
    [active, isPainting, paintAtUV]
  );

  const handlePointerUp = useCallback(() => {
    if (isPainting) stopPainting();
  }, [isPainting, stopPainting]);

  const handlePointerLeave = useCallback(() => {
    setCursor(null);
    if (isPainting) stopPainting();
  }, [isPainting, stopPainting]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className="absolute inset-0 z-20 cursor-crosshair"
      style={{ touchAction: 'none' }}
    />
  );
}
