/**
 * WizardFlow.ts — Brittney Conversation-Driven Wizard State Machine
 *
 * Manages the Absorb -> Scaffold -> Scenario -> Live Preview pipeline
 * that Brittney drives through natural conversation. Each stage transitions
 * based on Brittney's tool calls and user responses.
 */

import type { BrittneyMessage } from './BrittneySession';
import type { ProjectDNA as ScaffoldProjectDNA, ScaffoldResult } from '@/lib/workspace/scaffolder';

// ─── Stage definitions ──────────────────────────────────────────────────────

export type WizardStage =
  | 'greeting'   // "What are you building?"
  | 'intake'     // Understanding the user's intent
  | 'absorb'     // Scanning their GitHub repo (if they have one)
  | 'classify'   // ProjectDNA classification
  | 'consent'    // User approves what Brittney can do
  | 'scaffold'   // Generating Claude structure
  | 'scenario'   // Loading matching scenario template
  | 'preview'    // Live preview of their project
  | 'iterate'    // User refining with Brittney
  | 'deploy';    // Ready to deploy

/** Ordered stage list for progress tracking */
export const WIZARD_STAGES: readonly WizardStage[] = [
  'greeting',
  'intake',
  'absorb',
  'classify',
  'consent',
  'scaffold',
  'scenario',
  'preview',
  'iterate',
  'deploy',
] as const;

// ─── Consent gates ──────────────────────────────────────────────────────────

export interface ConsentGates {
  /** Which repos the user approved Brittney to access */
  repos: string[];
  /** Approved pushing .claude/ structure to their repo */
  scaffold: boolean;
  /** Approved codebase scan via Absorb */
  absorb: boolean;
  /** Approved sharing extracted patterns publicly on HoloMesh */
  publishKnowledge: boolean;
  /** Approved background self-improvement daemon */
  daemon: boolean;
}

export const DEFAULT_CONSENT: ConsentGates = {
  repos: [],
  scaffold: true,
  absorb: true,
  publishKnowledge: false,
  daemon: true,
};

/**
 * At least scaffold OR absorb must be approved to proceed.
 * Without either, Brittney can't do anything useful.
 */
export function isConsentSufficient(consent: ConsentGates): boolean {
  return consent.scaffold || consent.absorb;
}

// ─── Absorb progress ────────────────────────────────────────────────────────

export interface AbsorbProgress {
  status: 'idle' | 'cloning' | 'scanning' | 'analyzing' | 'complete' | 'error';
  filesScanned: number;
  totalFiles: number;
  currentFile: string;
  errorMessage?: string;
}

// ─── Wizard state ────────────────────────────────────────────────────────────

export interface WizardState {
  stage: WizardStage;
  userIntent: string;
  hasExistingCode: boolean;
  repoUrl?: string;
  projectDNA?: ScaffoldProjectDNA;
  scaffoldResult?: ScaffoldResult;
  selectedScenario?: string;
  compilationTargets: string[];
  generatedCode?: string;
  messages: BrittneyMessage[];
  absorbProgress: AbsorbProgress;
  /** User consent gates — what Brittney is allowed to do */
  consent: ConsentGates;
  /** Domain keywords extracted during intake */
  domainKeywords: string[];
  /** Timestamp of last state update (for staleness checks) */
  updatedAt: number;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: 'SET_STAGE'; stage: WizardStage }
  | { type: 'SET_INTENT'; intent: string }
  | { type: 'SET_HAS_CODE'; hasCode: boolean; repoUrl?: string }
  | { type: 'SET_DNA'; dna: ScaffoldProjectDNA }
  | { type: 'SET_SCAFFOLD'; result: ScaffoldResult }
  | { type: 'SET_SCENARIO'; scenarioId: string }
  | { type: 'SET_TARGETS'; targets: string[] }
  | { type: 'SET_GENERATED_CODE'; code: string }
  | { type: 'ADD_MESSAGE'; message: BrittneyMessage }
  | { type: 'SET_ABSORB_PROGRESS'; progress: Partial<AbsorbProgress> }
  | { type: 'SET_DOMAIN_KEYWORDS'; keywords: string[] }
  | { type: 'SET_CONSENT'; consent: Partial<ConsentGates> }
  | { type: 'ADVANCE_STAGE' }
  | { type: 'RESET' };

// ─── Initial state ───────────────────────────────────────────────────────────

export function createInitialWizardState(): WizardState {
  return {
    stage: 'greeting',
    userIntent: '',
    hasExistingCode: false,
    compilationTargets: [],
    messages: [],
    absorbProgress: {
      status: 'idle',
      filesScanned: 0,
      totalFiles: 0,
      currentFile: '',
    },
    consent: { ...DEFAULT_CONSENT },
    domainKeywords: [],
    updatedAt: Date.now(),
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  const base = { ...state, updatedAt: Date.now() };

  switch (action.type) {
    case 'SET_STAGE':
      return { ...base, stage: action.stage };

    case 'SET_INTENT':
      return { ...base, userIntent: action.intent };

    case 'SET_HAS_CODE':
      return {
        ...base,
        hasExistingCode: action.hasCode,
        repoUrl: action.repoUrl ?? base.repoUrl,
      };

    case 'SET_DNA':
      return { ...base, projectDNA: action.dna };

    case 'SET_SCAFFOLD':
      return { ...base, scaffoldResult: action.result };

    case 'SET_SCENARIO':
      return { ...base, selectedScenario: action.scenarioId };

    case 'SET_TARGETS':
      return { ...base, compilationTargets: action.targets };

    case 'SET_GENERATED_CODE':
      return { ...base, generatedCode: action.code };

    case 'ADD_MESSAGE':
      return { ...base, messages: [...base.messages, action.message] };

    case 'SET_ABSORB_PROGRESS':
      return {
        ...base,
        absorbProgress: { ...base.absorbProgress, ...action.progress },
      };

    case 'SET_DOMAIN_KEYWORDS':
      return { ...base, domainKeywords: action.keywords };

    case 'SET_CONSENT':
      return {
        ...base,
        consent: { ...base.consent, ...action.consent },
      };

    case 'ADVANCE_STAGE': {
      const currentIndex = WIZARD_STAGES.indexOf(base.stage);
      if (currentIndex < 0 || currentIndex >= WIZARD_STAGES.length - 1) return base;
      let nextStage = WIZARD_STAGES[currentIndex + 1];
      // Skip absorb stage if user has no existing code
      if (nextStage === 'absorb' && !base.hasExistingCode) {
        nextStage = 'classify';
      }
      return { ...base, stage: nextStage };
    }

    case 'RESET':
      return createInitialWizardState();

    default:
      return state;
  }
}

// ─── Stage metadata ──────────────────────────────────────────────────────────

export interface StageMeta {
  label: string;
  description: string;
  /** Whether this stage shows in the progress indicator */
  showInProgress: boolean;
  /** Whether the stage can be skipped */
  skippable: boolean;
}

export const STAGE_META: Record<WizardStage, StageMeta> = {
  greeting: {
    label: 'Welcome',
    description: 'Tell Brittney what you want to build',
    showInProgress: true,
    skippable: false,
  },
  intake: {
    label: 'Understanding',
    description: 'Brittney learns about your project',
    showInProgress: true,
    skippable: false,
  },
  absorb: {
    label: 'Scanning',
    description: 'Analyzing your existing codebase',
    showInProgress: true,
    skippable: true,
  },
  classify: {
    label: 'Classification',
    description: 'Building your project DNA',
    showInProgress: true,
    skippable: false,
  },
  consent: {
    label: 'Permissions',
    description: 'Choose what Brittney can do',
    showInProgress: true,
    skippable: false,
  },
  scaffold: {
    label: 'Scaffolding',
    description: 'Generating your project structure',
    showInProgress: true,
    skippable: false,
  },
  scenario: {
    label: 'Templates',
    description: 'Loading matching scenario templates',
    showInProgress: true,
    skippable: true,
  },
  preview: {
    label: 'Preview',
    description: 'Live preview of your project',
    showInProgress: true,
    skippable: false,
  },
  iterate: {
    label: 'Refine',
    description: 'Refining with Brittney',
    showInProgress: false,
    skippable: false,
  },
  deploy: {
    label: 'Deploy',
    description: 'Ready to deploy',
    showInProgress: false,
    skippable: false,
  },
};

// ─── Transition helpers ──────────────────────────────────────────────────────

/**
 * Determines the next stage based on a Brittney tool call.
 * Returns the action to dispatch, or null if the tool call
 * does not trigger a stage transition.
 */
export function toolCallToTransition(
  toolName: string,
  _args: Record<string, unknown>,
  currentStage: WizardStage
): WizardAction | null {
  switch (toolName) {
    // Brittney called absorb — move to absorb stage
    case 'absorb_scan':
    case 'absorb_run_absorb':
      if (currentStage === 'intake' || currentStage === 'greeting') {
        return { type: 'SET_STAGE', stage: 'absorb' };
      }
      return null;

    // Brittney classified the project
    case 'classify_project':
      if (currentStage === 'absorb' || currentStage === 'intake') {
        return { type: 'SET_STAGE', stage: 'classify' };
      }
      return null;

    // Brittney generated scaffold
    case 'scaffold_workspace':
      if (currentStage === 'classify' || currentStage === 'consent' || currentStage === 'intake') {
        return { type: 'SET_STAGE', stage: 'scaffold' };
      }
      return null;

    // Brittney mounted a scenario
    case 'mount_scenario_panel':
      return { type: 'SET_STAGE', stage: 'scenario' };

    // Brittney created objects — move to preview/iterate
    case 'create_object':
    case 'compose_traits':
      if (currentStage === 'scenario' || currentStage === 'scaffold') {
        return { type: 'SET_STAGE', stage: 'preview' };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Check whether the wizard state is complete enough to advance
 * from the current stage to the next.
 */
export function canAdvance(state: WizardState): boolean {
  switch (state.stage) {
    case 'greeting':
      return state.userIntent.length > 0;
    case 'intake':
      return state.domainKeywords.length > 0 || state.userIntent.length > 10;
    case 'absorb':
      return state.absorbProgress.status === 'complete';
    case 'classify':
      return state.projectDNA !== undefined;
    case 'consent':
      return isConsentSufficient(state.consent);
    case 'scaffold':
      return state.scaffoldResult !== undefined;
    case 'scenario':
      return state.selectedScenario !== undefined;
    case 'preview':
      return state.generatedCode !== undefined;
    case 'iterate':
      return true; // User decides when to deploy
    case 'deploy':
      return state.compilationTargets.length > 0;
    default:
      return false;
  }
}

/**
 * Serialize wizard state for localStorage persistence.
 * Strips non-serializable data and keeps the payload small.
 */
export function serializeWizardState(state: WizardState): string {
  return JSON.stringify({
    stage: state.stage,
    userIntent: state.userIntent,
    hasExistingCode: state.hasExistingCode,
    repoUrl: state.repoUrl,
    selectedScenario: state.selectedScenario,
    compilationTargets: state.compilationTargets,
    consent: state.consent,
    domainKeywords: state.domainKeywords,
    messages: state.messages.slice(-20), // Keep last 20 messages
    updatedAt: state.updatedAt,
  });
}

/**
 * Deserialize wizard state from localStorage.
 * Returns null if the data is invalid or too stale (>24 hours).
 */
export function deserializeWizardState(json: string): Partial<WizardState> | null {
  try {
    const parsed = JSON.parse(json) as Partial<WizardState>;
    // Reject stale sessions (>24 hours)
    if (
      typeof parsed.updatedAt === 'number' &&
      Date.now() - parsed.updatedAt > 24 * 60 * 60 * 1000
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
