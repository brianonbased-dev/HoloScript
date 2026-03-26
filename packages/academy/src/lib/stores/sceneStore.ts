'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { R3FNode } from '@holoscript/core';
import type { SceneMetadata } from '@/types';

// ─── Scene Store ────────────────────────────────────────────────────────────

interface SceneState {
  code: string;
  r3fTree: R3FNode | null;
  errors: Array<{ message: string; line?: number }>;
  metadata: SceneMetadata;
  isDirty: boolean;
  setCode: (code: string) => void;
  setR3FTree: (tree: R3FNode | null) => void;
  setErrors: (errors: Array<{ message: string; line?: number }>) => void;
  setMetadata: (partial: Partial<SceneMetadata>) => void;
  markClean: () => void;
  reset: () => void;
}

const defaultMetadata: SceneMetadata = {
  id: '',
  name: 'Untitled Scene',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const useSceneStore = create<SceneState>()(
  devtools(
    (set) => ({
      code: '',
      r3fTree: null,
      errors: [],
      metadata: { ...defaultMetadata },
      isDirty: false,
      setCode: (code) =>
        set({
          code,
          isDirty: true,
          metadata: { ...defaultMetadata, updatedAt: new Date().toISOString() },
        }),
      setR3FTree: (r3fTree) => set({ r3fTree }),
      setErrors: (errors) => set({ errors }),
      setMetadata: (partial) => set((s) => ({ metadata: { ...s.metadata, ...partial } })),
      markClean: () => set({ isDirty: false }),
      reset: () =>
        set({
          code: '',
          r3fTree: null,
          errors: [],
          metadata: { ...defaultMetadata },
          isDirty: false,
        }),
    }),
    { name: 'scene-store' }
  )
);
