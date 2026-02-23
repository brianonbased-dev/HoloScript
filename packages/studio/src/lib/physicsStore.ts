/**
 * physicsStore — global Rapier world + body registry
 *
 * Holds the World instance and a nodeId→body handle map.
 * Intentionally NOT serialized to disk — rebuilt on mount.
 */

import { create } from 'zustand';

// Rapier types referenced lazily to avoid import issues at SSR time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RapierWorld = any;

interface PhysicsState {
  world: RapierWorld | null;
  bodyMap: Map<string, number>; // nodeId → rigid body handle
  physicsEnabled: boolean;
  debugVisible: boolean;
  setWorld: (world: RapierWorld) => void;
  setPhysicsEnabled: (v: boolean) => void;
  setDebugVisible: (v: boolean) => void;
  reset: () => void;
}

export const usePhysicsStore = create<PhysicsState>((set, get) => ({
  world: null,
  bodyMap: new Map(),
  physicsEnabled: false,
  debugVisible: false,

  setWorld: (world) => set({ world }),
  setPhysicsEnabled: (physicsEnabled) => set({ physicsEnabled }),
  setDebugVisible: (debugVisible) => set({ debugVisible }),

  reset: () => {
    const { world } = get();
    if (world) {
      try { world.free(); } catch { /* wasm already freed */ }
    }
    set({ world: null, bodyMap: new Map(), physicsEnabled: false });
  },
}));
