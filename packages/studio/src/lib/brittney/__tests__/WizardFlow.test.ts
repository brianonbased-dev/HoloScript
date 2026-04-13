/**
 * WizardFlow.test.ts — Tests for the wizard state machine
 */

import { describe, it, expect } from 'vitest';
import {
  wizardReducer,
  createInitialWizardState,
  serializeWizardState,
  deserializeWizardState,
  toolCallToTransition,
  canAdvance,
  WIZARD_STAGES,
  STAGE_META,
  type WizardState,
  type WizardAction,
} from '../WizardFlow';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function reduce(state: WizardState, ...actions: WizardAction[]): WizardState {
  return actions.reduce((s, a) => wizardReducer(s, a), state);
}

function stateAt(stage: WizardState['stage'], overrides?: Partial<WizardState>): WizardState {
  return { ...createInitialWizardState(), stage, ...overrides };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WizardFlow', () => {
  describe('createInitialWizardState', () => {
    it('starts at greeting stage', () => {
      const state = createInitialWizardState();
      expect(state.stage).toBe('greeting');
      expect(state.messages).toHaveLength(0);
      expect(state.userIntent).toBe('');
      expect(state.hasExistingCode).toBe(false);
      expect(state.compilationTargets).toHaveLength(0);
    });
  });

  describe('wizardReducer', () => {
    it('SET_STAGE changes the stage', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, { type: 'SET_STAGE', stage: 'intake' });
      expect(next.stage).toBe('intake');
    });

    it('SET_INTENT records the user intent', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, { type: 'SET_INTENT', intent: 'build a dispensary' });
      expect(next.userIntent).toBe('build a dispensary');
    });

    it('SET_HAS_CODE records code availability and optional repo URL', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, {
        type: 'SET_HAS_CODE',
        hasCode: true,
        repoUrl: 'https://github.com/test/repo',
      });
      expect(next.hasExistingCode).toBe(true);
      expect(next.repoUrl).toBe('https://github.com/test/repo');
    });

    it('SET_HAS_CODE without repoUrl preserves existing repoUrl', () => {
      const state = stateAt('intake', { repoUrl: 'https://github.com/old/repo' });
      const next = wizardReducer(state, { type: 'SET_HAS_CODE', hasCode: false });
      expect(next.hasExistingCode).toBe(false);
      expect(next.repoUrl).toBe('https://github.com/old/repo');
    });

    it('ADD_MESSAGE appends to messages array', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, {
        type: 'ADD_MESSAGE',
        message: { role: 'user', content: 'hello' },
      });
      expect(next.messages).toHaveLength(1);
      expect(next.messages[0].content).toBe('hello');
    });

    it('SET_TARGETS updates compilation targets', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, {
        type: 'SET_TARGETS',
        targets: ['react', 'unity'],
      });
      expect(next.compilationTargets).toEqual(['react', 'unity']);
    });

    it('SET_GENERATED_CODE records the code', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, {
        type: 'SET_GENERATED_CODE',
        code: 'scene "test" {}',
      });
      expect(next.generatedCode).toBe('scene "test" {}');
    });

    it('SET_ABSORB_PROGRESS merges partial progress', () => {
      const state = createInitialWizardState();
      const next = reduce(state,
        { type: 'SET_ABSORB_PROGRESS', progress: { status: 'scanning', totalFiles: 100 } },
        { type: 'SET_ABSORB_PROGRESS', progress: { filesScanned: 50, currentFile: 'src/index.ts' } }
      );
      expect(next.absorbProgress.status).toBe('scanning');
      expect(next.absorbProgress.totalFiles).toBe(100);
      expect(next.absorbProgress.filesScanned).toBe(50);
      expect(next.absorbProgress.currentFile).toBe('src/index.ts');
    });

    it('SET_DOMAIN_KEYWORDS updates keywords', () => {
      const state = createInitialWizardState();
      const next = wizardReducer(state, {
        type: 'SET_DOMAIN_KEYWORDS',
        keywords: ['dispensary', 'cannabis'],
      });
      expect(next.domainKeywords).toEqual(['dispensary', 'cannabis']);
    });

    it('ADVANCE_STAGE goes to next stage', () => {
      const state = stateAt('greeting', { userIntent: 'test', hasExistingCode: true });
      const next = wizardReducer(state, { type: 'ADVANCE_STAGE' });
      expect(next.stage).toBe('intake');
    });

    it('ADVANCE_STAGE skips absorb when no existing code', () => {
      const state = stateAt('intake', { hasExistingCode: false });
      const next = wizardReducer(state, { type: 'ADVANCE_STAGE' });
      expect(next.stage).toBe('classify');
    });

    it('ADVANCE_STAGE goes to absorb when user has code', () => {
      const state = stateAt('intake', { hasExistingCode: true });
      const next = wizardReducer(state, { type: 'ADVANCE_STAGE' });
      expect(next.stage).toBe('absorb');
    });

    it('ADVANCE_STAGE does nothing at deploy (last stage)', () => {
      const state = stateAt('deploy');
      const next = wizardReducer(state, { type: 'ADVANCE_STAGE' });
      expect(next.stage).toBe('deploy');
    });

    it('RESET returns to initial state', () => {
      const state = stateAt('preview', {
        userIntent: 'something',
        messages: [{ role: 'user', content: 'hello' }],
      });
      const next = wizardReducer(state, { type: 'RESET' });
      expect(next.stage).toBe('greeting');
      expect(next.messages).toHaveLength(0);
      expect(next.userIntent).toBe('');
    });

    it('updates updatedAt timestamp on every action', () => {
      const state = createInitialWizardState();
      const before = state.updatedAt;
      // Ensure time passes
      const next = wizardReducer(state, { type: 'SET_INTENT', intent: 'test' });
      expect(next.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('WIZARD_STAGES', () => {
    it('has 10 stages in correct order', () => {
      expect(WIZARD_STAGES).toHaveLength(10);
      expect(WIZARD_STAGES[0]).toBe('greeting');
      expect(WIZARD_STAGES[9]).toBe('deploy');
    });

    it('every stage has metadata', () => {
      for (const stage of WIZARD_STAGES) {
        expect(STAGE_META[stage]).toBeDefined();
        expect(STAGE_META[stage].label).toBeTruthy();
        expect(STAGE_META[stage].description).toBeTruthy();
      }
    });
  });

  describe('toolCallToTransition', () => {
    it('absorb_scan from intake goes to absorb', () => {
      const result = toolCallToTransition('absorb_scan', {}, 'intake');
      expect(result).toEqual({ type: 'SET_STAGE', stage: 'absorb' });
    });

    it('absorb_run_absorb from greeting goes to absorb', () => {
      const result = toolCallToTransition('absorb_run_absorb', {}, 'greeting');
      expect(result).toEqual({ type: 'SET_STAGE', stage: 'absorb' });
    });

    it('classify_project from absorb goes to classify', () => {
      const result = toolCallToTransition('classify_project', {}, 'absorb');
      expect(result).toEqual({ type: 'SET_STAGE', stage: 'classify' });
    });

    it('scaffold_workspace from classify goes to scaffold', () => {
      const result = toolCallToTransition('scaffold_workspace', {}, 'classify');
      expect(result).toEqual({ type: 'SET_STAGE', stage: 'scaffold' });
    });

    it('mount_scenario_panel always goes to scenario', () => {
      const result = toolCallToTransition('mount_scenario_panel', {}, 'scaffold');
      expect(result).toEqual({ type: 'SET_STAGE', stage: 'scenario' });
    });

    it('create_object from scenario goes to preview', () => {
      const result = toolCallToTransition('create_object', {}, 'scenario');
      expect(result).toEqual({ type: 'SET_STAGE', stage: 'preview' });
    });

    it('unknown tool returns null', () => {
      const result = toolCallToTransition('random_tool', {}, 'intake');
      expect(result).toBeNull();
    });

    it('absorb_scan from preview returns null (wrong stage)', () => {
      const result = toolCallToTransition('absorb_scan', {}, 'preview');
      expect(result).toBeNull();
    });
  });

  describe('canAdvance', () => {
    it('greeting requires user intent', () => {
      expect(canAdvance(stateAt('greeting'))).toBe(false);
      expect(canAdvance(stateAt('greeting', { userIntent: 'build me a thing' }))).toBe(true);
    });

    it('intake requires domain keywords or long intent', () => {
      expect(canAdvance(stateAt('intake'))).toBe(false);
      expect(canAdvance(stateAt('intake', { domainKeywords: ['dispensary'] }))).toBe(true);
      expect(canAdvance(stateAt('intake', { userIntent: 'a long enough intent string' }))).toBe(true);
    });

    it('absorb requires complete status', () => {
      expect(canAdvance(stateAt('absorb'))).toBe(false);
      expect(
        canAdvance(
          stateAt('absorb', {
            absorbProgress: {
              status: 'complete',
              filesScanned: 100,
              totalFiles: 100,
              currentFile: '',
            },
          })
        )
      ).toBe(true);
    });

    it('classify requires projectDNA', () => {
      expect(canAdvance(stateAt('classify'))).toBe(false);
      expect(
        canAdvance(
          stateAt('classify', {
            projectDNA: {
              name: 'test',
              repoUrl: 'https://github.com/t/t',
              techStack: [],
              frameworks: [],
              languages: [],
              packageCount: 1,
              testCoverage: 0,
              codeHealthScore: 5,
              compilationTargets: [],
              traits: [],
            },
          })
        )
      ).toBe(true);
    });

    it('iterate always returns true', () => {
      expect(canAdvance(stateAt('iterate'))).toBe(true);
    });

    it('deploy requires compilation targets', () => {
      expect(canAdvance(stateAt('deploy'))).toBe(false);
      expect(
        canAdvance(stateAt('deploy', { compilationTargets: ['react'] }))
      ).toBe(true);
    });
  });

  describe('serialization', () => {
    it('round-trips state through serialize/deserialize', () => {
      const state = stateAt('intake', {
        userIntent: 'build dispensary',
        domainKeywords: ['dispensary'],
        messages: [{ role: 'user', content: 'hello' }],
      });
      const json = serializeWizardState(state);
      const restored = deserializeWizardState(json);
      expect(restored).not.toBeNull();
      expect(restored!.stage).toBe('intake');
      expect(restored!.userIntent).toBe('build dispensary');
      expect(restored!.domainKeywords).toEqual(['dispensary']);
    });

    it('truncates messages to last 20', () => {
      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: 'user' as const,
        content: `msg ${i}`,
      }));
      const state = stateAt('preview', { messages });
      const json = serializeWizardState(state);
      const restored = deserializeWizardState(json);
      expect(restored!.messages).toHaveLength(20);
      expect(restored!.messages![0].content).toBe('msg 10');
    });

    it('rejects stale sessions (>24 hours)', () => {
      const state = stateAt('intake', {
        updatedAt: Date.now() - 25 * 60 * 60 * 1000,
      });
      const json = serializeWizardState(state);
      // Manually set stale timestamp in the serialized data
      const parsed = JSON.parse(json);
      parsed.updatedAt = Date.now() - 25 * 60 * 60 * 1000;
      const restored = deserializeWizardState(JSON.stringify(parsed));
      expect(restored).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      expect(deserializeWizardState('not json')).toBeNull();
    });
  });
});
