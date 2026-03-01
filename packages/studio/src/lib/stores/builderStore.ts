'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ─── Builder Store ──────────────────────────────────────────────────────────

export type BuilderMode = 'place' | 'break' | 'select';
export type GeometryType = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'plane' | 'ring';

export interface HotbarSlot {
  geometry: GeometryType;
  color: string;
  label: string;
  material: {
    metalness: number;
    roughness: number;
    emissive?: string;
    emissiveIntensity?: number;
    opacity?: number;
  };
}

const DEFAULT_HOTBAR: HotbarSlot[] = [
  { geometry: 'cube',     color: '#6366f1', label: 'Cube',     material: { metalness: 0.1, roughness: 0.6 } },
  { geometry: 'sphere',   color: '#ec4899', label: 'Sphere',   material: { metalness: 0.3, roughness: 0.4 } },
  { geometry: 'cylinder', color: '#14b8a6', label: 'Cylinder', material: { metalness: 0.2, roughness: 0.5 } },
  { geometry: 'cone',     color: '#f59e0b', label: 'Cone',     material: { metalness: 0.1, roughness: 0.6 } },
  { geometry: 'torus',    color: '#8b5cf6', label: 'Torus',    material: { metalness: 0.5, roughness: 0.2 } },
  { geometry: 'capsule',  color: '#06b6d4', label: 'Capsule',  material: { metalness: 0.2, roughness: 0.5 } },
  { geometry: 'plane',    color: '#84cc16', label: 'Plane',    material: { metalness: 0.0, roughness: 0.8 } },
  { geometry: 'ring',     color: '#f43f5e', label: 'Ring',     material: { metalness: 0.7, roughness: 0.1 } },
];

interface BuilderState {
  // Grid
  gridSnap: boolean;
  gridSize: number;
  showGrid: boolean;

  // Builder mode
  builderMode: BuilderMode;

  // Hotbar
  activeSlot: number;
  hotbarSlots: HotbarSlot[];

  // Actions
  toggleGridSnap: () => void;
  setGridSize: (size: number) => void;
  toggleShowGrid: () => void;
  setBuilderMode: (mode: BuilderMode) => void;
  setActiveSlot: (slot: number) => void;
  updateSlot: (index: number, patch: Partial<HotbarSlot>) => void;
  getActiveShape: () => HotbarSlot;
}

export const useBuilderStore = create<BuilderState>()(
  devtools(
    (set, get) => ({
      gridSnap: true,
      gridSize: 0.5,
      showGrid: true,
      builderMode: 'place',
      activeSlot: 0,
      hotbarSlots: DEFAULT_HOTBAR,

      toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
      setGridSize: (gridSize) => set({ gridSize }),
      toggleShowGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      setBuilderMode: (builderMode) => set({ builderMode }),
      setActiveSlot: (activeSlot) => set({ activeSlot: Math.max(0, Math.min(7, activeSlot)) }),
      updateSlot: (index, patch) =>
        set((s) => ({
          hotbarSlots: s.hotbarSlots.map((slot, i) =>
            i === index ? { ...slot, ...patch } : slot
          ),
        })),
      getActiveShape: () => get().hotbarSlots[get().activeSlot],
    }),
    { name: 'builder-store' }
  )
);

/**
 * Snap a value to the nearest grid increment.
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a 3D position to grid.
 */
export function snapPosition(
  pos: [number, number, number],
  gridSize: number
): [number, number, number] {
  return [
    snapToGrid(pos[0], gridSize),
    snapToGrid(pos[1], gridSize),
    snapToGrid(pos[2], gridSize),
  ];
}
