/**
 * sketchStore — Zustand store for 3D Sketch mode
 *
 * Manages all freehand strokes drawn in the 3D viewport.
 * Each stroke is an array of [x,y,z] points + brush settings
 * captured during a single pointer-down → pointer-up gesture.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type BrushMaterial = 'neon' | 'chalk' | 'ink' | 'glow';

export interface Stroke {
  id: string;
  points: [number, number, number][];
  color: string;
  size: number;
  material: BrushMaterial;
}

interface SketchState {
  strokes: Stroke[];
  brushColor: string;
  brushSize: number;
  brushMaterial: BrushMaterial;

  // Active stroke being accumulated during pointer drag
  activeStroke: Stroke | null;

  addStroke: (stroke: Stroke) => void;
  removeStroke: (id: string) => void;
  clearStrokes: () => void;
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setBrushMaterial: (material: BrushMaterial) => void;
  beginStroke: () => string; // returns new stroke id
  appendPoint: (point: [number, number, number]) => void;
  commitStroke: () => void;
  cancelStroke: () => void;
}

export const useSketchStore = create<SketchState>()(
  devtools(
    (set, get) => ({
      strokes: [],
      brushColor: '#6366f1',
      brushSize: 0.015,
      brushMaterial: 'neon',
      activeStroke: null,

      addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),

      removeStroke: (id) => set((s) => ({ strokes: s.strokes.filter((st) => st.id !== id) })),

      clearStrokes: () => set({ strokes: [], activeStroke: null }),

      setBrushColor: (brushColor) => set({ brushColor }),
      setBrushSize: (brushSize) => set({ brushSize }),
      setBrushMaterial: (brushMaterial) => set({ brushMaterial }),

      beginStroke: () => {
        const { brushColor, brushSize, brushMaterial } = get();
        const id = `stroke_${Date.now()}`;
        const stroke: Stroke = {
          id,
          points: [],
          color: brushColor,
          size: brushSize,
          material: brushMaterial,
        };
        set({ activeStroke: stroke });
        return id;
      },

      appendPoint: (point) =>
        set((s) => {
          if (!s.activeStroke) return s;
          return {
            activeStroke: {
              ...s.activeStroke,
              points: [...s.activeStroke.points, point],
            },
          };
        }),

      commitStroke: () =>
        set((s) => {
          if (!s.activeStroke || s.activeStroke.points.length < 2) return { activeStroke: null };
          return {
            strokes: [...s.strokes, s.activeStroke],
            activeStroke: null,
          };
        }),

      cancelStroke: () => set({ activeStroke: null }),
    }),
    { name: 'sketch-store' }
  )
);
