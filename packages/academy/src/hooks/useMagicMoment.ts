'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { R3FNode } from '@holoscript/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MagicMomentStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface MagicMomentState {
  /** Current wizard step (0=Hello, 1=Type, 2=Enchant, 3=Share, 4=OneMoreThing, 5=Begin) */
  currentStep: MagicMomentStep;
  /** HoloScript source code in the editor */
  code: string;
  /** Compiled R3F scene tree (transient, not persisted) */
  compiledScene: R3FNode | null;
  /** Traits that have been applied via the Enchant step */
  appliedTraits: string[];
  /** Deployed URL from the Share step */
  deployedUrl: string | null;
  /** Whether the wizard has been completed (persisted) */
  isComplete: boolean;
  /** Whether the wizard is currently visible */
  isVisible: boolean;
  /** Direction of step navigation for animation */
  direction: 'forward' | 'backward';

  // ─── Actions ─────────────────────────────────────────────────────────────

  /** Navigate to the next step */
  nextStep: () => void;
  /** Navigate to the previous step */
  prevStep: () => void;
  /** Jump to a specific step */
  goToStep: (step: MagicMomentStep) => void;
  /** Update the editor code */
  setCode: (code: string) => void;
  /** Set the compiled scene (from useScenePipeline) */
  setCompiledScene: (scene: R3FNode | null) => void;
  /** Apply a trait — appends trait syntax to code and records it */
  applyTrait: (trait: string) => void;
  /** Remove a trait from code and record */
  removeTrait: (trait: string) => void;
  /** Set the deployed URL */
  setDeployedUrl: (url: string | null) => void;
  /** Skip directly to the workspace */
  skipToWorkspace: () => void;
  /** Mark the wizard as complete and hide it */
  completeWizard: () => void;
  /** Show the wizard (for re-triggering) */
  showWizard: () => void;
  /** Hide the wizard without completing */
  hideWizard: () => void;
  /** Reset wizard to initial state (for testing/re-onboarding) */
  reset: () => void;
}

// ─── Default code ────────────────────────────────────────────────────────────

export const MAGIC_MOMENT_DEFAULT_CODE = `object MyCube {
  position: [0, 1, 0]
  color: "#4488ff"
}`;

// ─── Trait snippets ──────────────────────────────────────────────────────────

const TRAIT_SNIPPETS: Record<string, string> = {
  physics: '\n  @physics',
  glow: '\n  @glow',
  interactive: '\n  @interactive',
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useMagicMoment = create<MagicMomentState>()(
  devtools(
    persist(
      (set, get) => ({
        currentStep: 0 as MagicMomentStep,
        code: MAGIC_MOMENT_DEFAULT_CODE,
        compiledScene: null,
        appliedTraits: [],
        deployedUrl: null,
        isComplete: false,
        isVisible: false,
        direction: 'forward' as const,

        nextStep: () => {
          const { currentStep } = get();
          if (currentStep < 5) {
            set({
              currentStep: (currentStep + 1) as MagicMomentStep,
              direction: 'forward',
            });
          }
        },

        prevStep: () => {
          const { currentStep } = get();
          if (currentStep > 0) {
            set({
              currentStep: (currentStep - 1) as MagicMomentStep,
              direction: 'backward',
            });
          }
        },

        goToStep: (step) => {
          const { currentStep } = get();
          set({
            currentStep: step,
            direction: step > currentStep ? 'forward' : 'backward',
          });
        },

        setCode: (code) => set({ code }),

        setCompiledScene: (compiledScene) => set({ compiledScene }),

        applyTrait: (trait) => {
          const { code, appliedTraits } = get();
          if (appliedTraits.includes(trait)) return;

          const snippet = TRAIT_SNIPPETS[trait];
          if (!snippet) return;

          // Insert trait before the closing brace
          const lastBrace = code.lastIndexOf('}');
          if (lastBrace === -1) return;

          const newCode = code.slice(0, lastBrace) + snippet + '\n' + code.slice(lastBrace);
          set({
            code: newCode,
            appliedTraits: [...appliedTraits, trait],
          });
        },

        removeTrait: (trait) => {
          const { code, appliedTraits } = get();
          if (!appliedTraits.includes(trait)) return;

          const snippet = TRAIT_SNIPPETS[trait];
          if (!snippet) return;

          // Remove the trait line from code
          const newCode = code.replace(snippet, '');
          set({
            code: newCode,
            appliedTraits: appliedTraits.filter((t) => t !== trait),
          });
        },

        setDeployedUrl: (deployedUrl) => set({ deployedUrl }),

        skipToWorkspace: () => {
          set({
            isComplete: true,
            isVisible: false,
          });
        },

        completeWizard: () => {
          set({
            currentStep: 5 as MagicMomentStep,
            isComplete: true,
            isVisible: false,
          });
        },

        showWizard: () => set({ isVisible: true }),

        hideWizard: () => set({ isVisible: false }),

        reset: () =>
          set({
            currentStep: 0 as MagicMomentStep,
            code: MAGIC_MOMENT_DEFAULT_CODE,
            compiledScene: null,
            appliedTraits: [],
            deployedUrl: null,
            isComplete: false,
            isVisible: true,
            direction: 'forward',
          }),
      }),
      {
        name: 'magic-moment-store',
        partialize: (state) => ({
          isComplete: state.isComplete,
          // Only persist completion status — code/scene are transient
        }),
      }
    ),
    { name: 'magic-moment-store' }
  )
);
