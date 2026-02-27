'use client';

/**
 * useTexturePaint — hook that manages a per-node CanvasTexture
 * for direct texture painting on mesh surfaces.
 *
 * Usage:
 *  const { texture, startPainting, stopPainting, clearCanvas, paintAtUV } = useTexturePaint();
 *
 * On each pointer move while painting:
 *  1. Ray-cast against the selected mesh to get UV coordinates.
 *  2. Call paintAtUV(u, v) to paint a circle onto the canvas.
 *  3. The CanvasTexture auto-refreshes (needsUpdate = true).
 */

import { useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

const CANVAS_SIZE = 1024;

export interface PaintSettings {
  color: string;
  size: number;       // px on canvas (4–128)
  opacity: number;    // 0–1
  blendMode: 'source-over' | 'multiply' | 'screen';
}

export const DEFAULT_PAINT: PaintSettings = {
  color: '#ec4899',
  size: 24,
  opacity: 0.8,
  blendMode: 'source-over',
};

export function useTexturePaint() {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const ctxRef     = useRef<CanvasRenderingContext2D | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [settings, setSettings] = useState<PaintSettings>(DEFAULT_PAINT);

  const ensureCanvas = useCallback(() => {
    if (canvasRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d')!;
    // Fill with mid-grey as base
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    canvasRef.current  = canvas;
    ctxRef.current     = ctx;
    textureRef.current = new THREE.CanvasTexture(canvas);
  }, []);

  const startPainting = useCallback(() => {
    ensureCanvas();
    setIsPainting(true);
  }, [ensureCanvas]);

  const stopPainting = useCallback(() => {
    setIsPainting(false);
  }, []);

  /** Paint a soft circle at normalized UV coordinates (0–1) */
  const paintAtUV = useCallback(
    (u: number, v: number) => {
      if (!ctxRef.current || !textureRef.current) return;
      const ctx = ctxRef.current;
      const x   = u * CANVAS_SIZE;
      const y   = (1 - v) * CANVAS_SIZE; // flip V (WebGL convention)

      ctx.globalCompositeOperation = settings.blendMode;
      ctx.globalAlpha = settings.opacity;

      // Radial gradient for soft brush edge
      const grad = ctx.createRadialGradient(x, y, 0, x, y, settings.size / 2);
      grad.addColorStop(0,   settings.color);
      grad.addColorStop(0.6, settings.color + 'cc'); // ~80%
      grad.addColorStop(1,   settings.color + '00'); // transparent edge

      ctx.beginPath();
      ctx.arc(x, y, settings.size / 2, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      textureRef.current.needsUpdate = true;
    },
    [settings]
  );

  const clearCanvas = useCallback(() => {
    if (!ctxRef.current || !textureRef.current) return;
    ctxRef.current.fillStyle = '#888888';
    ctxRef.current.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    textureRef.current.needsUpdate = true;
  }, []);

  const updateSettings = useCallback((patch: Partial<PaintSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return {
    texture:          textureRef.current,
    isPainting,
    settings,
    startPainting,
    stopPainting,
    paintAtUV,
    clearCanvas,
    updateSettings,
    ensureCanvas,
  };
}
