'use client';

/**
 * useWizardFlow — React hook managing the Brittney wizard state machine.
 *
 * Auto-advances stages based on Brittney's tool calls, persists state
 * to localStorage so users can resume interrupted sessions.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  wizardReducer,
  createInitialWizardState,
  serializeWizardState,
  deserializeWizardState,
  toolCallToTransition,
  canAdvance,
  type WizardState,
  type WizardAction,
  type WizardStage,
  type AbsorbProgress,
} from '@/lib/brittney/WizardFlow';
import type { BrittneyMessage } from '@/lib/brittney/BrittneySession';
import type { ProjectDNA as ScaffoldProjectDNA, ScaffoldResult } from '@/lib/workspace/scaffolder';
import {
  matchScenarios,
  extractDomainKeywords,
  getGenericTemplate,
  getScenarioTemplate,
  type MatchResult,
} from '@/lib/brittney/ScenarioMatcher';

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'brittney-wizard-state';

// ─── Hook return type ────────────────────────────────────────────────────────

export interface UseWizardFlowResult {
  /** Current wizard state */
  state: WizardState;

  /** Current scenario match results */
  scenarioMatch: MatchResult;

  /** Whether the current stage can advance */
  canAdvanceStage: boolean;

  // ── Stage control ────────────────────────────────────────────────
  /** Set the stage explicitly */
  setStage: (stage: WizardStage) => void;
  /** Advance to the next logical stage */
  advanceStage: () => void;
  /** Reset the wizard to the beginning */
  reset: () => void;

  // ── Data setters ─────────────────────────────────────────────────
  /** Record the user's intent description */
  setIntent: (intent: string) => void;
  /** Record whether the user has existing code */
  setHasCode: (hasCode: boolean, repoUrl?: string) => void;
  /** Set the project DNA after classification */
  setDNA: (dna: ScaffoldProjectDNA) => void;
  /** Set scaffold results */
  setScaffold: (result: ScaffoldResult) => void;
  /** Select a scenario template */
  selectScenario: (scenarioId: string) => void;
  /** Set compilation targets */
  setTargets: (targets: string[]) => void;
  /** Set generated code */
  setGeneratedCode: (code: string) => void;
  /** Add a message to the conversation */
  addMessage: (message: BrittneyMessage) => void;
  /** Update absorb progress */
  updateAbsorbProgress: (progress: Partial<AbsorbProgress>) => void;

  // ── Brittney integration ─────────────────────────────────────────
  /**
   * Process a tool call from Brittney's response.
   * Automatically transitions stages when appropriate.
   */
  handleToolCall: (toolName: string, args: Record<string, unknown>) => void;

  /**
   * Process a user message — extracts domain keywords
   * and auto-advances intake stage.
   */
  handleUserMessage: (content: string) => void;

  /**
   * Generate template code for the current state.
   * Uses the best scenario match or falls back to generic.
   */
  generateTemplateCode: () => string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useWizardFlow(): UseWizardFlowResult {
  // Load persisted state or start fresh
  const initialState = useRef<WizardState>(() => {
    if (typeof window === 'undefined') return createInitialWizardState();

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const partial = deserializeWizardState(stored);
        if (partial) {
          return {
            ...createInitialWizardState(),
            ...partial,
          };
        }
      }
    } catch {
      // localStorage unavailable
    }

    return createInitialWizardState();
  });

  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    () => (typeof initialState.current === 'function'
      ? (initialState.current as () => WizardState)()
      : initialState.current)
  );

  // Persist state on every change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, serializeWizardState(state));
    } catch {
      // localStorage unavailable or full
    }
  }, [state]);

  // ── Scenario matching (recomputed on state changes) ────────────
  const scenarioMatch = matchScenarios(
    state.userIntent,
    state.projectDNA
  );

  const canAdvanceStage = canAdvance(state);

  // ── Action dispatchers ─────────────────────────────────────────
  const setStage = useCallback((stage: WizardStage) => {
    dispatch({ type: 'SET_STAGE', stage });
  }, []);

  const advanceStage = useCallback(() => {
    dispatch({ type: 'ADVANCE_STAGE' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const setIntent = useCallback((intent: string) => {
    dispatch({ type: 'SET_INTENT', intent });
    const keywords = extractDomainKeywords(intent);
    if (keywords.length > 0) {
      dispatch({ type: 'SET_DOMAIN_KEYWORDS', keywords });
    }
  }, []);

  const setHasCode = useCallback((hasCode: boolean, repoUrl?: string) => {
    dispatch({ type: 'SET_HAS_CODE', hasCode, repoUrl });
  }, []);

  const setDNA = useCallback((dna: ScaffoldProjectDNA) => {
    dispatch({ type: 'SET_DNA', dna });
  }, []);

  const setScaffold = useCallback((result: ScaffoldResult) => {
    dispatch({ type: 'SET_SCAFFOLD', result });
  }, []);

  const selectScenario = useCallback((scenarioId: string) => {
    dispatch({ type: 'SET_SCENARIO', scenarioId });
  }, []);

  const setTargets = useCallback((targets: string[]) => {
    dispatch({ type: 'SET_TARGETS', targets });
  }, []);

  const setGeneratedCode = useCallback((code: string) => {
    dispatch({ type: 'SET_GENERATED_CODE', code });
  }, []);

  const addMessage = useCallback((message: BrittneyMessage) => {
    dispatch({ type: 'ADD_MESSAGE', message });
  }, []);

  const updateAbsorbProgress = useCallback((progress: Partial<AbsorbProgress>) => {
    dispatch({ type: 'SET_ABSORB_PROGRESS', progress });
  }, []);

  // ── Brittney integration ───────────────────────────────────────

  const handleToolCall = useCallback(
    (toolName: string, args: Record<string, unknown>) => {
      const transition = toolCallToTransition(toolName, args, state.stage);
      if (transition) {
        dispatch(transition);
      }
    },
    [state.stage]
  );

  const handleUserMessage = useCallback(
    (content: string) => {
      dispatch({ type: 'ADD_MESSAGE', message: { role: 'user', content } });

      // Extract keywords from the message
      const keywords = extractDomainKeywords(content);
      if (keywords.length > 0) {
        dispatch({ type: 'SET_DOMAIN_KEYWORDS', keywords });
      }

      // Auto-advance from greeting to intake on first substantive message
      if (state.stage === 'greeting' && content.length > 5) {
        dispatch({ type: 'SET_INTENT', intent: content });
        dispatch({ type: 'SET_STAGE', stage: 'intake' });
      }

      // Detect repo URLs in the message
      const repoMatch = content.match(
        /https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/
      );
      if (repoMatch) {
        dispatch({ type: 'SET_HAS_CODE', hasCode: true, repoUrl: repoMatch[0] });
      }
    },
    [state.stage]
  );

  const generateTemplateCode = useCallback((): string => {
    const projectName = state.projectDNA?.name ?? 'my-project';
    const targets = state.compilationTargets;

    if (state.selectedScenario) {
      const scenario = scenarioMatch.ranked.find(
        (m) => m.scenario.id === state.selectedScenario
      );
      if (scenario) {
        return getScenarioTemplate(scenario.scenario, projectName);
      }
    }

    if (scenarioMatch.best) {
      return getScenarioTemplate(scenarioMatch.best.scenario, projectName);
    }

    return getGenericTemplate(projectName, targets);
  }, [state.selectedScenario, state.projectDNA, state.compilationTargets, scenarioMatch]);

  return {
    state,
    scenarioMatch,
    canAdvanceStage,
    setStage,
    advanceStage,
    reset,
    setIntent,
    setHasCode,
    setDNA,
    setScaffold,
    selectScenario,
    setTargets,
    setGeneratedCode,
    addMessage,
    updateAbsorbProgress,
    handleToolCall,
    handleUserMessage,
    generateTemplateCode,
  };
}
