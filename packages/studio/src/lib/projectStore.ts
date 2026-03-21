import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { StudioEvents } from './analytics';

/**
 * projectStore — multi-scene project management.
 *
 * A "project" is a collection of named scene tabs, each with its own code.
 * The active scene drives the main editor (synced with useSceneStore externally).
 */

export interface ProjectScene {
  id: string;
  name: string;
  code: string;
  isDirty: boolean;
  createdAt: string;
}

interface ProjectState {
  scenes: ProjectScene[];
  activeSceneId: string | null;

  // Actions
  addScene: (name?: string) => ProjectScene;
  removeScene: (id: string) => void;
  updateSceneCode: (id: string, code: string) => void;
  renameScene: (id: string, name: string) => void;
  switchScene: (id: string) => void;
  markSceneClean: (id: string) => void;
  activeScene: () => ProjectScene | null;
}

function makeId() {
  return `scene_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
}

const DEFAULT_SCENE: ProjectScene = {
  id: 'default',
  name: 'Scene 1',
  code: '// New scene\nscene "Untitled" {\n\n}\n',
  isDirty: false,
  createdAt: new Date().toISOString(),
};

export const useProjectStore = create<ProjectState>()(
  devtools(
    (set, get) => ({
      scenes: [DEFAULT_SCENE],
      activeSceneId: 'default',

      addScene: (name) => {
        const scene: ProjectScene = {
          id: makeId(),
          name: name ?? `Scene ${get().scenes.length + 1}`,
          code: '// New scene\nscene "Untitled" {\n\n}\n',
          isDirty: false,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ scenes: [...s.scenes, scene], activeSceneId: scene.id }));
        StudioEvents.sceneCreated(scene.name);
        return scene;
      },

      removeScene: (id) => {
        const scenes = get().scenes.filter((s) => s.id !== id);
        const activeSceneId =
          get().activeSceneId === id
            ? (scenes[scenes.length - 1]?.id ?? null)
            : get().activeSceneId;
        set({ scenes, activeSceneId });
      },

      updateSceneCode: (id, code) => {
        set((s) => ({
          scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, code, isDirty: true } : sc)),
        }));
      },

      renameScene: (id, name) => {
        set((s) => ({
          scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, name } : sc)),
        }));
      },

      switchScene: (id) => set({ activeSceneId: id }),

      markSceneClean: (id) => {
        set((s) => ({
          scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, isDirty: false } : sc)),
        }));
      },

      activeScene: () => {
        const { scenes, activeSceneId } = get();
        return scenes.find((s) => s.id === activeSceneId) ?? null;
      },
    }),
    { name: 'project-store' }
  )
);
