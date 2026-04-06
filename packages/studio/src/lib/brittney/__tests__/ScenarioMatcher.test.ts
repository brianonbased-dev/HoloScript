/**
 * ScenarioMatcher.test.ts — Tests for scenario matching and domain extraction
 */

import { describe, it, expect } from 'vitest';
import {
  matchScenarios,
  extractDomainKeywords,
  getGenericTemplate,
  getScenarioTemplate,
} from '../ScenarioMatcher';
import type { ProjectDNA } from '@/lib/workspace/scaffolder';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDNA(overrides?: Partial<ProjectDNA>): ProjectDNA {
  return {
    name: 'test-project',
    repoUrl: 'https://github.com/test/repo',
    techStack: [],
    frameworks: [],
    languages: [],
    packageCount: 1,
    testCoverage: 50,
    codeHealthScore: 7,
    compilationTargets: [],
    traits: [],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScenarioMatcher', () => {
  describe('matchScenarios', () => {
    it('matches "dispensary" intent to farm/nonspatial', () => {
      const result = matchScenarios('I want to build a dispensary inventory system');
      expect(result.ranked.length).toBeGreaterThan(0);
      const ids = result.ranked.map((m) => m.scenario.id);
      expect(ids.some((id) => id === 'farm' || id === 'nonspatial')).toBe(true);
    });

    it('matches "surgical" intent to surgery scenario', () => {
      const result = matchScenarios('Help me build a surgical training simulator');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('surgery');
    });

    it('matches "music" intent to music scenario', () => {
      const result = matchScenarios('music audio MIDI mixing studio');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('music');
    });

    it('matches "climate" to climate dashboard', () => {
      const result = matchScenarios('Build a climate monitoring dashboard');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('climate');
    });

    it('matches DNA/genomics intent', () => {
      const result = matchScenarios('I want to analyze DNA sequences and CRISPR guides');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('dna');
    });

    it('matches space/rocket intent', () => {
      const result = matchScenarios('Build a rocket mission planning tool');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('space');
    });

    it('matches cybersecurity/threat to SOC', () => {
      const result = matchScenarios('cybersecurity threat breach network SOC');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('soc');
    });

    it('returns usedFallback=true for unmatched intents', () => {
      const result = matchScenarios('xyzzy');
      expect(result.usedFallback).toBe(true);
      expect(result.best).toBeNull();
    });

    it('uses ProjectDNA frameworks for scoring', () => {
      const dna = makeDNA({ frameworks: ['pytorch'] });
      const result = matchScenarios('build a neural network', dna);
      const ids = result.ranked.map((m) => m.scenario.id);
      expect(ids).toContain('v6-snn');
    });

    it('uses compilation targets for scoring', () => {
      const dna = makeDNA({ compilationTargets: ['unity'] });
      const result = matchScenarios('compile my project', dna);
      const ids = result.ranked.map((m) => m.scenario.id);
      expect(ids).toContain('v6-compiler');
    });

    it('provides match reasons', () => {
      const result = matchScenarios('I want to build with MIDI and audio');
      expect(result.best).not.toBeNull();
      expect(result.best!.reasons.length).toBeGreaterThan(0);
      expect(result.best!.reasons.some((r) => r.includes('midi') || r.includes('audio'))).toBe(true);
    });

    it('ranked results are sorted by score descending', () => {
      const result = matchScenarios('I want to build a music and film production tool');
      for (let i = 1; i < result.ranked.length; i++) {
        expect(result.ranked[i].score).toBeLessThanOrEqual(result.ranked[i - 1].score);
      }
    });

    it('matches ocean/marine intent', () => {
      const result = matchScenarios('Build an ocean exploration tool for marine biology');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('ocean');
    });

    it('matches archaeology intent', () => {
      const result = matchScenarios('archaeology artifact history dig site');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('archaeology');
    });

    it('matches bridge/structural engineering', () => {
      const result = matchScenarios('Simulate bridge structural stress analysis');
      expect(result.best).not.toBeNull();
      expect(result.best!.scenario.id).toBe('bridge');
    });
  });

  describe('extractDomainKeywords', () => {
    it('extracts known domain keywords', () => {
      const keywords = extractDomainKeywords('I run a dispensary with cannabis products');
      expect(keywords).toContain('dispensary');
      expect(keywords).toContain('cannabis');
    });

    it('extracts science keywords', () => {
      const keywords = extractDomainKeywords('DNA sequencing and genomics analysis');
      expect(keywords).toContain('dna');
    });

    it('returns empty for unrecognized input', () => {
      const keywords = extractDomainKeywords('xyzzy something');
      expect(keywords).toHaveLength(0);
    });

    it('handles multiple domain matches', () => {
      const keywords = extractDomainKeywords('music and film production studio');
      expect(keywords).toContain('music');
      expect(keywords).toContain('film');
    });
  });

  describe('getGenericTemplate', () => {
    it('generates valid HoloScript with project name', () => {
      const code = getGenericTemplate('my-app', ['react', 'unity']);
      expect(code).toContain('my-app');
      expect(code).toContain('scene');
      expect(code).toContain('react, unity');
    });

    it('handles empty targets', () => {
      const code = getGenericTemplate('test', []);
      expect(code).toContain('No compilation targets');
    });
  });

  describe('getScenarioTemplate', () => {
    it('generates template with scenario metadata', () => {
      const code = getScenarioTemplate(
        {
          id: 'music',
          name: 'Music Studio',
          emoji: '🎵',
          category: 'arts',
          description: 'MIDI keyboard, mixer, BPM transport, gain',
          tags: ['audio', 'midi', 'mixing'],
          engine: 'musicProduction',
          testCount: 20,
        },
        'my-music-app'
      );
      expect(code).toContain('my-music-app');
      expect(code).toContain('Music Studio');
      expect(code).toContain('musicProduction');
      expect(code).toContain('scene');
    });
  });
});
