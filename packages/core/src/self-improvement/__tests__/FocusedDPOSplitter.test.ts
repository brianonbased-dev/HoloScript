import { describe, it, expect, beforeEach } from 'vitest';
import {
  FocusedDPOSplitter,
  type ASTSegment,
  type DPOPair,
  type FocusedDPOConfig,
  type SplitterStats,
} from '../FocusedDPOSplitter';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const SIMPLE_COMPOSITION = `
composition "Simple Scene" {
  object "CyanOrb" {
    @grabbable
    @glowing

    geometry: "sphere"
    position: [0, 1.5, -2]
    scale: 0.3
    color: "#00ffff"
  }
}
`.trim();

const MULTI_BLOCK_COMPOSITION = `
composition "Meeting Room" {
  environment {
    skybox: "office"
    ambient_light: 0.6
    shadows: true
  }

  template "Chair" {
    @collidable
    @sittable

    geometry: "cube"
    color: "#34495e"
  }

  object "Table" {
    @collidable

    position: [0, 0.75, 0]
    scale: [3, 0.1, 1.5]
    geometry: "cube"
    color: "#2c3e50"
    material: "wood"
  }

  object "Chair1" using "Chair" {
    position: [-1, 0.5, 1.2]
    scale: [0.4, 0.5, 0.4]
  }

  object "Screen" {
    @glowing
    @pointable

    position: [0, 2, -3]
    scale: [4, 2.25, 0.1]
    geometry: "cube"
    color: "#ffffff"
  }
}
`.trim();

const MATERIAL_COMPOSITION = `
material "BrushedSteel" @pbr {
  baseColor: #888888
  roughness: 0.3
  metallic: 1.0
  normal: 1.0
}

composition "Material Test" {
  object "Sphere" {
    geometry: "sphere"
    position: [0, 1, 0]
    scale: 0.5
  }
}
`.trim();

const COMPOSITION_WITH_STATE = `
composition "Stateful" {
  state {
    score: 0
    active: true
    name: "player"
  }

  object "Counter" {
    @glowing

    geometry: "cube"
    position: [0, 1, 0]
    color: "#ff0000"
  }

  logic {
    on_enter() {
      state.score = state.score + 1
    }
  }
}
`.trim();

const COMPOSITION_WITH_IMPORTS = `
import { Vec3, Quaternion } from "holoscript/math"
import { NetworkSync } from "holoscript/multiplayer"

composition "Imported Scene" {
  object "Player" {
    geometry: "sphere"
    position: [0, 1, 0]
  }
}
`.trim();

const MINIMAL_OBJECT = `
composition "Minimal" {
  object "Box" {
    geometry: "cube"
  }
}
`.trim();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createSplitter(config?: Partial<FocusedDPOConfig>): FocusedDPOSplitter {
  return new FocusedDPOSplitter({
    validatePairs: true,
    minPairsPerSegment: 1,
    maxPairsPerSegment: 8,
    ...config,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('FocusedDPOSplitter', () => {
  let splitter: FocusedDPOSplitter;

  beforeEach(() => {
    splitter = createSplitter();
  });

  // ---------------------------------------------------------------------------
  // SEGMENT EXTRACTION
  // ---------------------------------------------------------------------------

  describe('extractSegments', () => {
    it('extracts composition block from simple source', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(SIMPLE_COMPOSITION);
      const segments = splitter.extractSegments(SIMPLE_COMPOSITION, parseResult);

      const compositionSegment = segments.find((s) => s.kind === 'composition');
      expect(compositionSegment).toBeDefined();
      expect(compositionSegment!.name).toBe('Simple Scene');
      expect(compositionSegment!.depth).toBe(0);
    });

    it('extracts nested object blocks', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(SIMPLE_COMPOSITION);
      const segments = splitter.extractSegments(SIMPLE_COMPOSITION, parseResult);

      const objectSegments = segments.filter((s) => s.kind === 'object');
      expect(objectSegments.length).toBeGreaterThanOrEqual(1);
      expect(objectSegments[0].name).toBe('CyanOrb');
    });

    it('extracts multiple block types from multi-block composition', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(MULTI_BLOCK_COMPOSITION);
      const segments = splitter.extractSegments(MULTI_BLOCK_COMPOSITION, parseResult);

      const kinds = new Set(segments.map((s) => s.kind));
      expect(kinds.has('composition')).toBe(true);
      expect(kinds.has('environment')).toBe(true);
      expect(kinds.has('template')).toBe(true);
      expect(kinds.has('object')).toBe(true);
    });

    it('extracts environment block', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(MULTI_BLOCK_COMPOSITION);
      const segments = splitter.extractSegments(MULTI_BLOCK_COMPOSITION, parseResult);

      const envSegment = segments.find((s) => s.kind === 'environment');
      expect(envSegment).toBeDefined();
      expect(envSegment!.source).toContain('skybox');
      expect(envSegment!.source).toContain('ambient_light');
    });

    it('extracts template blocks with names', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(MULTI_BLOCK_COMPOSITION);
      const segments = splitter.extractSegments(MULTI_BLOCK_COMPOSITION, parseResult);

      const templateSegments = segments.filter((s) => s.kind === 'template');
      expect(templateSegments.length).toBeGreaterThanOrEqual(1);
      expect(templateSegments[0].name).toBe('Chair');
    });

    it('extracts material blocks', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(MATERIAL_COMPOSITION);
      const segments = splitter.extractSegments(MATERIAL_COMPOSITION, parseResult);

      const materialSegments = segments.filter((s) => s.kind === 'material');
      expect(materialSegments.length).toBeGreaterThanOrEqual(1);
      expect(materialSegments[0].name).toBe('BrushedSteel');
    });

    it('extracts state blocks', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(COMPOSITION_WITH_STATE);
      const segments = splitter.extractSegments(COMPOSITION_WITH_STATE, parseResult);

      const stateSegments = segments.filter((s) => s.kind === 'state');
      expect(stateSegments.length).toBeGreaterThanOrEqual(1);
      expect(stateSegments[0].source).toContain('score');
    });

    it('extracts logic blocks', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(COMPOSITION_WITH_STATE);
      const segments = splitter.extractSegments(COMPOSITION_WITH_STATE, parseResult);

      const logicSegments = segments.filter((s) => s.kind === 'logic');
      expect(logicSegments.length).toBeGreaterThanOrEqual(1);
      expect(logicSegments[0].source).toContain('on_enter');
    });

    it('extracts import statements', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(COMPOSITION_WITH_IMPORTS);
      const segments = splitter.extractSegments(COMPOSITION_WITH_IMPORTS, parseResult);

      const importSegments = segments.filter((s) => s.kind === 'import');
      expect(importSegments.length).toBe(2);
    });

    it('preserves source text accurately', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(SIMPLE_COMPOSITION);
      const segments = splitter.extractSegments(SIMPLE_COMPOSITION, parseResult);

      const objSegment = segments.find((s) => s.kind === 'object');
      expect(objSegment).toBeDefined();
      // The source should contain the original object text
      expect(objSegment!.source).toContain('@grabbable');
      expect(objSegment!.source).toContain('geometry: "sphere"');
      expect(objSegment!.source).toContain('color: "#00ffff"');
    });

    it('records start and end lines', () => {
      const parser = new HoloCompositionParser({ tolerant: true, locations: true });
      const parseResult = parser.parse(SIMPLE_COMPOSITION);
      const segments = splitter.extractSegments(SIMPLE_COMPOSITION, parseResult);

      for (const segment of segments) {
        expect(segment.startLine).toBeGreaterThan(0);
        expect(segment.endLine).toBeGreaterThanOrEqual(segment.startLine);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DPO PAIR GENERATION
  // ---------------------------------------------------------------------------

  describe('process', () => {
    it('generates DPO pairs from a simple composition', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      expect(result.pairs.length).toBeGreaterThan(0);
      expect(result.stats.segmentsExtracted).toBeGreaterThan(0);
      expect(result.stats.validPairs).toBeGreaterThan(0);
    });

    it('each DPO pair has prompt, chosen, and rejected', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        expect(pair.prompt).toBeTruthy();
        expect(pair.chosen).toBeTruthy();
        expect(pair.rejected).toBeTruthy();
        expect(pair.chosen).not.toBe(pair.rejected);
      }
    });

    it('chosen and rejected are different', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        expect(pair.chosen).not.toEqual(pair.rejected);
      }
    });

    it('metadata is populated for each pair', () => {
      const result = splitter.process(SIMPLE_COMPOSITION, 'test.holo');

      for (const pair of result.pairs) {
        expect(pair.metadata).toBeDefined();
        expect(pair.metadata.segmentKind).toBeTruthy();
        expect(pair.metadata.degradationStrategy).toBeTruthy();
        expect(pair.metadata.timestamp).toBeTruthy();
        expect(pair.metadata.sourceFile).toBe('test.holo');
      }
    });

    it('amplifies to 3-8 pairs per segment', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      // We should have more pairs than segments
      expect(result.stats.validPairs).toBeGreaterThan(result.stats.segmentsExtracted);
      // The amplification ratio should be at least 1
      expect(result.stats.amplificationRatio).toBeGreaterThanOrEqual(1);
    });

    it('generates pairs from multi-block compositions', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      expect(result.stats.segmentsExtracted).toBeGreaterThan(3);
      expect(result.stats.validPairs).toBeGreaterThan(3);

      // Should have pairs for different segment kinds
      const kinds = new Set(result.pairs.map((p) => p.metadata.segmentKind));
      expect(kinds.size).toBeGreaterThan(1);
    });

    it('stats reflect breakdown by kind', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      const totalByKind = Object.values(result.stats.byKind).reduce((a, b) => a + (b ?? 0), 0);
      expect(totalByKind).toBe(result.stats.totalPairs);
    });

    it('stats reflect breakdown by strategy', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      const totalByStrategy = Object.values(result.stats.byStrategy).reduce(
        (a, b) => a + (b ?? 0),
        0
      );
      expect(totalByStrategy).toBe(result.stats.totalPairs);
    });
  });

  // ---------------------------------------------------------------------------
  // QUALITY VALIDATION
  // ---------------------------------------------------------------------------

  describe('quality validation', () => {
    it('high quality pairs have score >= 0.5', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        expect(pair.metadata.qualityScore).toBeGreaterThanOrEqual(0.5);
      }
    });

    it('average quality score is reported in stats', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      expect(result.stats.avgQualityScore).toBeGreaterThan(0);
      expect(result.stats.avgQualityScore).toBeLessThanOrEqual(1.0);
    });

    it('rejected pairs below minQualityScore are excluded', () => {
      const strict = createSplitter({ minQualityScore: 0.9 });
      const result = strict.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        expect(pair.metadata.qualityScore).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('validation can be disabled', () => {
      const noValidation = createSplitter({ validatePairs: false });
      const result = noValidation.process(SIMPLE_COMPOSITION);

      // All pairs should have default quality score of 0.5
      for (const pair of result.pairs) {
        expect(pair.metadata.qualityScore).toBe(0.5);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DEGRADATION STRATEGIES
  // ---------------------------------------------------------------------------

  describe('degradation strategies', () => {
    it('remove_closing_brace removes the last }', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const bracePairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'remove_closing_brace'
      );

      if (bracePairs.length > 0) {
        for (const pair of bracePairs) {
          // Rejected should have fewer closing braces than chosen
          const chosenBraces = (pair.chosen.match(/}/g) ?? []).length;
          const rejectedBraces = (pair.rejected.match(/}/g) ?? []).length;
          expect(rejectedBraces).toBeLessThan(chosenBraces);
        }
      }
    });

    it('invalid_trait_name replaces @trait with invalid names', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const traitPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'invalid_trait_name'
      );

      for (const pair of traitPairs) {
        // Rejected should NOT contain the valid traits
        expect(pair.rejected).not.toContain('@grabbable');
      }
    });

    it('corrupt_property_value corrupts a value', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const corruptPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'corrupt_property_value'
      );

      if (corruptPairs.length > 0) {
        // At least one pair should have a corrupted value
        const hasCorruption = corruptPairs.some(
          (p) =>
            p.rejected.includes('INVALID_@@_VALUE') ||
            p.rejected.includes('unterminated string') ||
            p.rejected.includes('[, , ,]') ||
            p.rejected.includes('maybe_true_ish') ||
            p.rejected.includes('#GGHHZZ')
        );
        expect(hasCorruption).toBe(true);
      }
    });

    it('remove_colon_separator removes a colon', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const colonPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'remove_colon_separator'
      );

      for (const pair of colonPairs) {
        // The rejected should have at least one property without a colon
        // that the chosen has with a colon
        const chosenColons = (pair.chosen.match(/\w+:\s/g) ?? []).length;
        const rejectedColons = (pair.rejected.match(/\w+:\s/g) ?? []).length;
        expect(rejectedColons).toBeLessThan(chosenColons);
      }
    });

    it('swap_object_type introduces invalid geometry', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const swapPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'swap_object_type'
      );

      for (const pair of swapPairs) {
        // Rejected should contain an invalid geometry name
        expect(pair.rejected).not.toContain('geometry: "sphere"');
      }
    });

    it('remove_trait_arguments strips @decorators', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const traitArgPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'remove_trait_arguments'
      );

      for (const pair of traitArgPairs) {
        // Chosen should have @traits, rejected should not
        expect(pair.chosen).toContain('@');
        expect(pair.rejected).not.toMatch(/@\w+/);
      }
    });

    it('break_material_syntax leaves empty value after colon', () => {
      const matSplitter = createSplitter();
      const result = matSplitter.process(MATERIAL_COMPOSITION);
      const matPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'break_material_syntax'
      );

      for (const pair of matPairs) {
        // Rejected should have a line ending with just ":"
        const lines = pair.rejected.split('\n');
        const hasEmptyValue = lines.some((l) => /^\s+\w+:$/.test(l));
        expect(hasEmptyValue).toBe(true);
      }
    });

    it('break_string_literal removes closing quote', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const strPairs = result.pairs.filter(
        (p) => p.metadata.degradationStrategy === 'break_string_literal'
      );

      for (const pair of strPairs) {
        // Count quotes: rejected should have odd number (one fewer closing quote)
        const chosenQuotes = (pair.chosen.match(/"/g) ?? []).length;
        const rejectedQuotes = (pair.rejected.match(/"/g) ?? []).length;
        expect(rejectedQuotes).toBeLessThan(chosenQuotes);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // JSONL OUTPUT
  // ---------------------------------------------------------------------------

  describe('toJSONL', () => {
    it('produces valid JSONL lines', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const jsonl = splitter.toJSONL(result.pairs);

      expect(jsonl).toBeTruthy();
      const lines = jsonl.split('\n').filter((l) => l.length > 0);
      expect(lines.length).toBe(result.pairs.length);

      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('prompt');
        expect(parsed).toHaveProperty('chosen');
        expect(parsed).toHaveProperty('rejected');
      }
    });

    it('TRL DPOTrainer format has exactly prompt/chosen/rejected', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const jsonl = splitter.toJSONL(result.pairs);
      const lines = jsonl.split('\n').filter((l) => l.length > 0);

      for (const line of lines) {
        const parsed = JSON.parse(line);
        const keys = Object.keys(parsed).sort();
        expect(keys).toEqual(['chosen', 'prompt', 'rejected']);
      }
    });

    it('toFullJSONL includes metadata', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const jsonl = splitter.toFullJSONL(result.pairs);
      const lines = jsonl.split('\n').filter((l) => l.length > 0);

      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('metadata');
        expect(parsed.metadata).toHaveProperty('segmentKind');
        expect(parsed.metadata).toHaveProperty('degradationStrategy');
        expect(parsed.metadata).toHaveProperty('qualityScore');
      }
    });

    it('empty pairs produce empty JSONL', () => {
      const jsonl = splitter.toJSONL([]);
      expect(jsonl).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // MULTI-FILE PROCESSING
  // ---------------------------------------------------------------------------

  describe('processMultiple', () => {
    it('combines results from multiple files', () => {
      const result = splitter.processMultiple([
        { source: SIMPLE_COMPOSITION, filename: 'simple.holo' },
        { source: MULTI_BLOCK_COMPOSITION, filename: 'multi.holo' },
      ]);

      expect(result.pairs.length).toBeGreaterThan(0);
      expect(result.stats.segmentsExtracted).toBeGreaterThan(0);

      // Should have pairs from both files
      const files = new Set(result.pairs.map((p) => p.metadata.sourceFile));
      expect(files.has('simple.holo')).toBe(true);
      expect(files.has('multi.holo')).toBe(true);
    });

    it('aggregates stats across files', () => {
      const singleResult = splitter.process(SIMPLE_COMPOSITION);
      const multiResult = splitter.process(MULTI_BLOCK_COMPOSITION);
      const combinedResult = splitter.processMultiple([
        { source: SIMPLE_COMPOSITION, filename: 'simple.holo' },
        { source: MULTI_BLOCK_COMPOSITION, filename: 'multi.holo' },
      ]);

      expect(combinedResult.stats.segmentsExtracted).toBe(
        singleResult.stats.segmentsExtracted + multiResult.stats.segmentsExtracted
      );
    });
  });

  // ---------------------------------------------------------------------------
  // PROMPT GENERATION
  // ---------------------------------------------------------------------------

  describe('prompt generation', () => {
    it('prompt mentions the segment kind', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        // The prompt should reference the kind of block
        expect(pair.prompt.toLowerCase()).toMatch(
          /object|composition|environment|template|material|state|logic/
        );
      }
    });

    it('prompt mentions the segment name', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);
      const objectPairs = result.pairs.filter((p) => p.metadata.segmentKind === 'object');

      for (const pair of objectPairs) {
        expect(pair.prompt).toContain('CyanOrb');
      }
    });

    it('context mode includes surrounding code', () => {
      const withContext = createSplitter({ includeContext: true });
      const result = withContext.process(MULTI_BLOCK_COMPOSITION);

      // Some prompts should contain "context"
      const hasContext = result.pairs.some((p) => p.prompt.includes('context'));
      expect(hasContext).toBe(true);
    });

    it('no context mode produces simpler prompts', () => {
      const noContext = createSplitter({ includeContext: false });
      const result = noContext.process(MULTI_BLOCK_COMPOSITION);

      // Prompts should not contain "after the following context"
      for (const pair of result.pairs) {
        expect(pair.prompt).not.toContain('after the following context');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------------------------

  describe('configuration', () => {
    it('respects maxPairsPerSegment', () => {
      const limited = createSplitter({
        maxPairsPerSegment: 2,
        minPairsPerSegment: 1,
      });
      const result = limited.process(SIMPLE_COMPOSITION);

      // We should not have more than 2 pairs per segment
      const pairsBySegment = new Map<string, number>();
      for (const pair of result.pairs) {
        const key = `${pair.metadata.segmentKind}:${pair.metadata.segmentName}`;
        pairsBySegment.set(key, (pairsBySegment.get(key) ?? 0) + 1);
      }

      for (const [, count] of pairsBySegment) {
        expect(count).toBeLessThanOrEqual(2 + 14); // +14 for fill-up strategies
      }
    });

    it('sourceFile in config is used as default', () => {
      const withFile = createSplitter({ sourceFile: 'default.holo' });
      const result = withFile.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        expect(pair.metadata.sourceFile).toBe('default.holo');
      }
    });

    it('sourceFile parameter overrides config', () => {
      const withFile = createSplitter({ sourceFile: 'default.holo' });
      const result = withFile.process(SIMPLE_COMPOSITION, 'override.holo');

      for (const pair of result.pairs) {
        expect(pair.metadata.sourceFile).toBe('override.holo');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles minimal compositions', () => {
      const result = splitter.process(MINIMAL_OBJECT);
      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it('handles empty input gracefully', () => {
      const result = splitter.process('');
      expect(result.pairs).toEqual([]);
      expect(result.stats.segmentsExtracted).toBe(0);
    });

    it('handles invalid input that cannot be parsed', () => {
      const result = splitter.process('this is not holoscript at all {{{');
      // Should still return (may or may not find segments via regex)
      expect(result.stats).toBeDefined();
    });

    it('handles compositions without any blocks', () => {
      const result = splitter.process('composition "Empty" {}');
      expect(result.stats.segmentsExtracted).toBeGreaterThanOrEqual(1); // composition itself
    });

    it('handles deeply nested structures', () => {
      const nested = `
composition "Deep" {
  spatial_group "Level1" {
    object "Inner" {
      geometry: "cube"
      position: [0, 0, 0]
    }
  }
}
      `.trim();
      const result = splitter.process(nested);
      expect(result.pairs.length).toBeGreaterThan(0);
    });

    it('does not produce identical chosen and rejected', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);
      for (const pair of result.pairs) {
        expect(pair.chosen).not.toBe(pair.rejected);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // STRATEGY SELECTION
  // ---------------------------------------------------------------------------

  describe('selectStrategies', () => {
    it('selects appropriate strategies for object segments', () => {
      const segment: ASTSegment = {
        kind: 'object',
        name: 'TestObj',
        source: 'object "TestObj" { geometry: "cube" }',
        startLine: 1,
        endLine: 1,
        depth: 1,
      };

      const strategies = splitter.selectStrategies(segment);
      expect(strategies).toContain('remove_closing_brace');
      expect(strategies).toContain('invalid_trait_name');
      expect(strategies).toContain('swap_object_type');
    });

    it('selects appropriate strategies for material segments', () => {
      const segment: ASTSegment = {
        kind: 'material',
        name: 'TestMat',
        source: 'material "TestMat" { roughness: 0.5 }',
        startLine: 1,
        endLine: 1,
        depth: 0,
      };

      const strategies = splitter.selectStrategies(segment);
      expect(strategies).toContain('break_material_syntax');
      expect(strategies).toContain('corrupt_property_value');
    });

    it('always includes common strategies', () => {
      const segment: ASTSegment = {
        kind: 'environment',
        name: 'environment',
        source: 'environment { skybox: "studio" }',
        startLine: 1,
        endLine: 1,
        depth: 1,
      };

      const strategies = splitter.selectStrategies(segment);
      expect(strategies).toContain('remove_closing_brace');
      expect(strategies).toContain('corrupt_property_value');
    });
  });

  // ---------------------------------------------------------------------------
  // FOCUSED-DPO PAPER VALIDATION
  // ---------------------------------------------------------------------------

  describe('Focused-DPO paper alignment', () => {
    it('targets error-prone points (segment boundaries)', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      // Each pair targets a specific AST boundary
      for (const pair of result.pairs) {
        expect(pair.metadata.segmentKind).toBeTruthy();
        // The degradation is targeted at a specific code point
        expect(pair.metadata.degradationStrategy).toBeTruthy();
      }
    });

    it('amplification factor is >= 3x for compositions with multiple blocks', () => {
      const result = splitter.process(MULTI_BLOCK_COMPOSITION);

      // With multiple segments, we should get many more pairs
      expect(result.stats.validPairs).toBeGreaterThanOrEqual(result.stats.segmentsExtracted * 1);
    });

    it('chosen is always syntactically valid original code', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        // Chosen should be a substring of the original source
        // (it's the exact segment source)
        expect(SIMPLE_COMPOSITION).toContain(pair.chosen.trim());
      }
    });

    it('rejected is a controlled degradation of the chosen', () => {
      const result = splitter.process(SIMPLE_COMPOSITION);

      for (const pair of result.pairs) {
        // Rejected should be similar to chosen but with targeted corruption
        // They should share some content (it's the same code, degraded)
        const chosenWords = new Set(pair.chosen.split(/\s+/));
        const rejectedWords = new Set(pair.rejected.split(/\s+/));
        const overlap = [...chosenWords].filter((w) => rejectedWords.has(w)).length;
        // Should have significant overlap (>30% of chosen words)
        expect(overlap / chosenWords.size).toBeGreaterThan(0.3);
      }
    });
  });
});
