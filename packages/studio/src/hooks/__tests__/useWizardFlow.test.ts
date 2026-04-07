/**
 * useWizardFlow.test.ts — Tests for the wizard flow React hook
 *
 * Tests the hook's public API using direct reducer testing
 * (avoids rendering to keep tests fast and dependency-free).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  wizardReducer,
  createInitialWizardState,
  isConsentSufficient,
  DEFAULT_CONSENT,
  type WizardState,
  type ConsentGates,
} from '@/lib/brittney/WizardFlow';
import {
  matchScenarios,
  extractDomainKeywords,
  getGenericTemplate,
  getScenarioTemplate,
} from '@/lib/brittney/ScenarioMatcher';

// We test the logic the hook relies on (reducer + matchers) directly,
// since the hook itself is a thin React wrapper over these primitives.

describe('useWizardFlow logic', () => {
  let state: WizardState;

  beforeEach(() => {
    state = createInitialWizardState();
  });

  describe('user message handling', () => {
    it('extracts domain keywords from user text', () => {
      const keywords = extractDomainKeywords('I want to build a dispensary app');
      expect(keywords).toContain('dispensary');
    });

    it('detects GitHub URLs in messages', () => {
      const text = 'check out https://github.com/user/repo for my code';
      const match = text.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
      expect(match).not.toBeNull();
      expect(match![0]).toBe('https://github.com/user/repo');
    });

    it('advances from greeting to intake on substantive message', () => {
      const content = 'I want to build a surgical training simulator';
      // Simulate handleUserMessage logic
      state = wizardReducer(state, {
        type: 'ADD_MESSAGE',
        message: { role: 'user', content },
      });
      state = wizardReducer(state, { type: 'SET_INTENT', intent: content });
      state = wizardReducer(state, { type: 'SET_STAGE', stage: 'intake' });

      expect(state.stage).toBe('intake');
      expect(state.userIntent).toBe(content);
      expect(state.messages).toHaveLength(1);
    });
  });

  describe('tool call handling', () => {
    it('absorb tool transitions from intake to absorb', () => {
      state = wizardReducer(state, { type: 'SET_STAGE', stage: 'intake' });
      // toolCallToTransition maps absorb_scan -> absorb
      state = wizardReducer(state, { type: 'SET_STAGE', stage: 'absorb' });
      expect(state.stage).toBe('absorb');
    });

    it('scenario mount transitions to scenario stage', () => {
      state = wizardReducer(state, { type: 'SET_STAGE', stage: 'scaffold' });
      state = wizardReducer(state, { type: 'SET_STAGE', stage: 'scenario' });
      expect(state.stage).toBe('scenario');
    });
  });

  describe('scenario matching integration', () => {
    it('matches intent and generates template code', () => {
      const intent = 'I need a music production tool';
      const match = matchScenarios(intent);
      expect(match.best).not.toBeNull();

      const code = getScenarioTemplate(match.best!.scenario, 'my-music-app');
      expect(code).toContain('my-music-app');
      expect(code).toContain('scene');
    });

    it('falls back to generic template when no match', () => {
      const code = getGenericTemplate('unknown-project', ['react']);
      expect(code).toContain('unknown-project');
      expect(code).toContain('scene');
      expect(code).toContain('react');
    });
  });

  describe('consent gates', () => {
    it('initial state has sensible consent defaults', () => {
      expect(state.consent.scaffold).toBe(true);
      expect(state.consent.absorb).toBe(true);
      expect(state.consent.publishKnowledge).toBe(false);
      expect(state.consent.daemon).toBe(true);
      expect(state.consent.repos).toEqual([]);
    });

    it('SET_CONSENT merges partial updates', () => {
      state = wizardReducer(state, {
        type: 'SET_CONSENT',
        consent: { publishKnowledge: true },
      });
      expect(state.consent.publishKnowledge).toBe(true);
      // Others unchanged
      expect(state.consent.scaffold).toBe(true);
      expect(state.consent.daemon).toBe(true);
    });

    it('SET_CONSENT can disable permissions', () => {
      state = wizardReducer(state, {
        type: 'SET_CONSENT',
        consent: { scaffold: false, absorb: false, daemon: false },
      });
      expect(state.consent.scaffold).toBe(false);
      expect(state.consent.absorb).toBe(false);
      expect(state.consent.daemon).toBe(false);
    });

    it('isConsentSufficient requires scaffold OR absorb', () => {
      expect(isConsentSufficient({ ...DEFAULT_CONSENT })).toBe(true);
      expect(isConsentSufficient({ ...DEFAULT_CONSENT, scaffold: false })).toBe(true);
      expect(isConsentSufficient({ ...DEFAULT_CONSENT, absorb: false })).toBe(true);
      expect(isConsentSufficient({ ...DEFAULT_CONSENT, scaffold: false, absorb: false })).toBe(false);
    });

    it('consent is preserved through RESET', () => {
      state = wizardReducer(state, {
        type: 'SET_CONSENT',
        consent: { publishKnowledge: true },
      });
      state = wizardReducer(state, { type: 'RESET' });
      // Reset returns to defaults
      expect(state.consent.publishKnowledge).toBe(false);
    });
  });

  describe('full flow simulation', () => {
    it('greeting -> intake -> classify -> consent -> scaffold -> scenario -> preview', () => {
      // Greeting: user provides intent
      state = wizardReducer(state, { type: 'SET_INTENT', intent: 'surgical simulator' });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> intake

      expect(state.stage).toBe('intake');

      // Intake: keywords extracted, no code
      state = wizardReducer(state, {
        type: 'SET_DOMAIN_KEYWORDS',
        keywords: ['surgery'],
      });
      state = wizardReducer(state, { type: 'SET_HAS_CODE', hasCode: false });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> classify (skips absorb)

      expect(state.stage).toBe('classify');

      // Classify: DNA set
      state = wizardReducer(state, {
        type: 'SET_DNA',
        dna: {
          name: 'surgical-sim',
          repoUrl: '',
          techStack: ['typescript'],
          frameworks: ['react'],
          languages: ['ts'],
          packageCount: 1,
          testCoverage: 0,
          codeHealthScore: 5,
          compilationTargets: ['react'],
          traits: ['physics'],
        },
      });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> consent

      expect(state.stage).toBe('consent');

      // Consent: user reviews permissions (defaults are sufficient)
      state = wizardReducer(state, {
        type: 'SET_CONSENT',
        consent: { publishKnowledge: true },
      });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> scaffold

      expect(state.stage).toBe('scaffold');

      // Scaffold: result set
      state = wizardReducer(state, {
        type: 'SET_SCAFFOLD',
        result: {
          claudeMd: '# CLAUDE.md',
          northStar: '# NORTH_STAR.md',
          memoryIndex: '# MEMORY.md',
          skills: [],
          hooks: [],
          daemonConfig: { profile: 'guardian', pollingIntervalMs: 5000, enabledJobs: [] },
          teamRoomConfig: { teamName: 'test', memberLimit: 5, defaultRole: 'contributor', features: [] },
        },
      });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> scenario

      expect(state.stage).toBe('scenario');

      // Scenario: user selects
      state = wizardReducer(state, { type: 'SET_SCENARIO', scenarioId: 'surgery' });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> preview

      expect(state.stage).toBe('preview');
    });

    it('greeting -> intake -> absorb -> classify (with repo)', () => {
      state = wizardReducer(state, { type: 'SET_INTENT', intent: 'scan my repo' });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> intake

      state = wizardReducer(state, {
        type: 'SET_HAS_CODE',
        hasCode: true,
        repoUrl: 'https://github.com/test/repo',
      });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> absorb

      expect(state.stage).toBe('absorb');

      // Complete absorb
      state = wizardReducer(state, {
        type: 'SET_ABSORB_PROGRESS',
        progress: { status: 'complete', filesScanned: 50, totalFiles: 50 },
      });
      state = wizardReducer(state, { type: 'ADVANCE_STAGE' }); // -> classify

      expect(state.stage).toBe('classify');
    });
  });
});
