'use client';
/**
 * useViewport — Hook managing the live 3D viewport state
 *
 * Bridges panel hooks (Camera, Lighting, Terrain) to the R3F scene.
 * Listens to useStudioBus events to reactively update the viewport.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useStudioBus } from './useStudioBus';

export type ViewportMode = 'scene' | 'wireframe' | 'normals' | 'uv' | 'flat-semantic';

export interface ViewportEntity {
  id: string;
  name: string;
  type: 'box' | 'sphere' | 'plane' | 'cylinder' | 'cone' | 'torus';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  selected?: boolean;
}

export interface ViewportLight {
  id: string;
  type: 'directional' | 'point' | 'spot' | 'ambient';
  position: [number, number, number];
  color: string;
  intensity: number;
  enabled: boolean;
}

export interface ViewportState {
  entities: ViewportEntity[];
  lights: ViewportLight[];
  gridVisible: boolean;
  axesVisible: boolean;
  mode: ViewportMode;
  backgroundColor: string;
  selectedId: string | null;
  stats: { fps: number; drawCalls: number; triangles: number };
}

const DEMO_ENTITIES: ViewportEntity[] = [
  {
    id: 'ground',
    name: 'Ground',
    type: 'plane',
    position: [0, 0, 0],
    rotation: [-Math.PI / 2, 0, 0],
    scale: [20, 20, 1],
    color: '#3a5a3a',
  },
  {
    id: 'player',
    name: 'Player',
    type: 'box',
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    scale: [1, 2, 1],
    color: '#4488ff',
  },
  {
    id: 'enemy',
    name: 'Enemy',
    type: 'sphere',
    position: [5, 1, -3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: '#ff4444',
  },
  {
    id: 'tower',
    name: 'Tower',
    type: 'cylinder',
    position: [-4, 2.5, 2],
    rotation: [0, 0, 0],
    scale: [0.8, 5, 0.8],
    color: '#888888',
  },
  {
    id: 'gem',
    name: 'Gem',
    type: 'torus',
    position: [3, 2, 4],
    rotation: [Math.PI / 4, 0, 0],
    scale: [0.5, 0.5, 0.5],
    color: '#ffaa00',
  },
];

const DEMO_LIGHTS: ViewportLight[] = [
  {
    id: 'sun',
    type: 'directional',
    position: [10, 15, 5],
    color: '#ffe8c0',
    intensity: 1.5,
    enabled: true,
  },
  {
    id: 'fill',
    type: 'point',
    position: [-5, 3, 5],
    color: '#6699ff',
    intensity: 0.6,
    enabled: true,
  },
  {
    id: 'ambient',
    type: 'ambient',
    position: [0, 0, 0],
    color: '#1a1a2e',
    intensity: 0.3,
    enabled: true,
  },
];

export interface UseViewportReturn {
  state: ViewportState;
  addEntity: (entity: Omit<ViewportEntity, 'id'>) => string;
  removeEntity: (id: string) => void;
  selectEntity: (id: string | null) => void;
  moveEntity: (id: string, pos: [number, number, number]) => void;
  setMode: (mode: ViewportMode) => void;
  toggleGrid: () => void;
  toggleAxes: () => void;
  setBackground: (color: string) => void;
  updateLight: (id: string, updates: Partial<ViewportLight>) => void;
  buildDemo: () => void;
  clear: () => void;
}

export function useViewport(): UseViewportReturn {
  const { emit, on } = useStudioBus();
  const idCounter = useRef(0);
  const [state, setState] = useState<ViewportState>({
    entities: DEMO_ENTITIES,
    lights: DEMO_LIGHTS,
    gridVisible: true,
    axesVisible: true,
    mode: 'scene',
    backgroundColor: '#1a1a2e',
    selectedId: null,
    stats: { fps: 60, drawCalls: 0, triangles: 0 },
  });

  // Listen for bus events from other panels
  useEffect(() => {
    const unsubs = [
      on('lighting:changed', (data: any) => {
        if (data?.lights) {
          setState((prev) => ({
            ...prev,
            lights: data.lights.map((l: any) => ({
              id: l.id || 'light',
              type: l.type || 'point',
              position: l.position ? [l.position.x, l.position.y, l.position.z] : [0, 5, 0],
              color: Array.isArray(l.color)
                ? `rgb(${Math.floor(l.color[0] * 255)},${Math.floor(l.color[1] * 255)},${Math.floor(l.color[2] * 255)})`
                : '#ffffff',
              intensity: l.intensity ?? 1,
              enabled: l.enabled !== false,
            })),
          }));
        }
      }),
      on('camera:moved', (data: any) => {
        // Camera updates handled by R3F camera directly
        emit('viewport:camera-sync', data);
      }),
      on('terrain:changed', () => {
        // Re-render terrain mesh
        emit('viewport:invalidate', {});
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [on, emit]);

  const addEntity = useCallback(
    (entity: Omit<ViewportEntity, 'id'>) => {
      const id = `entity-${idCounter.current++}`;
      setState((prev) => ({ ...prev, entities: [...prev.entities, { ...entity, id }] }));
      emit('viewport:entity-added', { id, ...entity });
      return id;
    },
    [emit]
  );

  const removeEntity = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        entities: prev.entities.filter((e) => e.id !== id),
        selectedId: prev.selectedId === id ? null : prev.selectedId,
      }));
      emit('viewport:entity-removed', { id });
    },
    [emit]
  );

  const selectEntity = useCallback((id: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedId: id,
      entities: prev.entities.map((e) => ({ ...e, selected: e.id === id })),
    }));
  }, []);

  const moveEntity = useCallback((id: string, pos: [number, number, number]) => {
    setState((prev) => ({
      ...prev,
      entities: prev.entities.map((e) => (e.id === id ? { ...e, position: pos } : e)),
    }));
  }, []);

  const setMode = useCallback((mode: ViewportMode) => setState((prev) => ({ ...prev, mode })), []);
  const toggleGrid = useCallback(
    () => setState((prev) => ({ ...prev, gridVisible: !prev.gridVisible })),
    []
  );
  const toggleAxes = useCallback(
    () => setState((prev) => ({ ...prev, axesVisible: !prev.axesVisible })),
    []
  );
  const setBackground = useCallback(
    (color: string) => setState((prev) => ({ ...prev, backgroundColor: color })),
    []
  );

  const updateLight = useCallback((id: string, updates: Partial<ViewportLight>) => {
    setState((prev) => ({
      ...prev,
      lights: prev.lights.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  }, []);

  const buildDemo = useCallback(() => {
    setState((prev) => ({ ...prev, entities: DEMO_ENTITIES, lights: DEMO_LIGHTS }));
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({ ...prev, entities: [], selectedId: null }));
  }, []);

  return {
    state,
    addEntity,
    removeEntity,
    selectEntity,
    moveEntity,
    setMode,
    toggleGrid,
    toggleAxes,
    setBackground,
    updateLight,
    buildDemo,
    clear,
  };
}
