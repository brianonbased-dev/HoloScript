/**
 * Tests for the SelfImprovementPipeline
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  SelfImprovementPipeline,
  FailedGeneration,
} from '../self-improvement/SelfImprovementPipeline';

describe('SelfImprovementPipeline', () => {
  let pipeline: SelfImprovementPipeline;

  beforeEach(() => {
    pipeline = new SelfImprovementPipeline({ autoFlushInterval: 0 });
  });

  describe('capture', () => {
    test('should capture a failed generation', () => {
      pipeline.capture({
        id: 'fail-001',
        timestamp: Date.now(),
        prompt: 'Create a grabbable sphere',
        generatedCode: 'object "Ball" { geometry: "sper" }',
        errors: ['unknown geometry type: sper'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const stats = pipeline.getStats();
      expect(stats.totalCaptures).toBe(1);
      expect(stats.byCategory['validation-error']).toBe(1);
    });

    test('should capture parse errors via convenience method', () => {
      pipeline.captureParseError('Create a template', 'template "Test" { geometry: "cube" ', [
        'unexpected end of input',
      ]);

      const stats = pipeline.getStats();
      expect(stats.totalCaptures).toBe(1);
      expect(stats.byCategory['parse-error']).toBe(1);
    });

    test('should track file type distribution', () => {
      pipeline.capture({
        id: 'f1',
        timestamp: Date.now(),
        prompt: 'test',
        generatedCode: 'test',
        errors: ['error'],
        fileType: '.holo',
        category: 'parse-error',
      });

      pipeline.capture({
        id: 'f2',
        timestamp: Date.now(),
        prompt: 'test',
        generatedCode: 'test',
        errors: ['error'],
        fileType: '.hsplus',
        category: 'parse-error',
      });

      const stats = pipeline.getStats();
      expect(stats.byFileType['.holo']).toBe(1);
      expect(stats.byFileType['.hsplus']).toBe(1);
    });
  });

  describe('auto-correction', () => {
    test('should fix geometry typos', () => {
      pipeline.capture({
        id: 'fix-geo',
        timestamp: Date.now(),
        prompt: 'Create a sphere',
        generatedCode: 'object "Ball" { geometry: "sper" }',
        errors: ['unknown geometry type'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const examples = pipeline.getTrainingExamples();
      expect(examples.length).toBeGreaterThan(0);

      // Corrected code should have "sphere"
      const fixExample = examples.find((e) => e.instruction.includes('Fix the following'));
      expect(fixExample?.output).toContain('geometry: "sphere"');
    });

    test('should fix missing closing braces', () => {
      pipeline.capture({
        id: 'fix-brace',
        timestamp: Date.now(),
        prompt: 'Create a template',
        generatedCode: 'composition "Test" {\n  template "Foo" {\n    geometry: "cube"',
        errors: ["expected '}'"],
        fileType: '.hsplus',
        category: 'parse-error',
      });

      const examples = pipeline.getTrainingExamples();
      const fixExample = examples.find((e) => e.instruction.includes('Fix the following'));
      // Should close the missing braces
      expect(fixExample?.output).toBeDefined();
      const closeBraces = (fixExample?.output.match(/}/g) || []).length;
      const openBraces = (fixExample?.output.match(/{/g) || []).length;
      expect(closeBraces).toBe(openBraces);
    });

    test('should fix property name typos', () => {
      pipeline.capture({
        id: 'fix-prop',
        timestamp: Date.now(),
        prompt: 'Animate rotation',
        generatedCode: "property: 'rotate.y'",
        errors: ['unknown property name'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const examples = pipeline.getTrainingExamples();
      const fixExample = examples.find((e) => e.instruction.includes('Fix the following'));
      expect(fixExample?.output).toContain('rotation.y');
    });

    test('should add missing traits for event handlers', () => {
      pipeline.capture({
        id: 'fix-trait',
        timestamp: Date.now(),
        prompt: 'Create a grabbable cube',
        generatedCode: 'object "Cube" {\n  geometry: "cube"\n  onGrab: { }\n}',
        errors: ['handler onGrab requires trait @grabbable'],
        fileType: '.hsplus',
        category: 'generation-error',
      });

      const examples = pipeline.getTrainingExamples();
      const fixExample = examples.find((e) => e.instruction.includes('Fix the following'));
      expect(fixExample?.output).toContain('@grabbable');
    });
  });

  describe('training data conversion', () => {
    test('should generate 3 examples per failure with correction', () => {
      pipeline.capture({
        id: 'conv-001',
        timestamp: Date.now(),
        prompt: 'Create a sphere',
        generatedCode: 'object "Ball" { geometry: "sper" }',
        correctedCode: 'object "Ball" { geometry: "sphere" }',
        errors: ['unknown geometry type'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const examples = pipeline.getTrainingExamples();
      // 3 examples: fix, prompt-to-correct, error explanation
      expect(examples).toHaveLength(3);
    });

    test('should format examples in Alpaca style', () => {
      pipeline.capture({
        id: 'alpaca-001',
        timestamp: Date.now(),
        prompt: 'Create a cube',
        generatedCode: 'object "Box" { geometry: "cub" }',
        correctedCode: 'object "Box" { geometry: "cube" }',
        errors: ['unknown geometry type'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const examples = pipeline.getTrainingExamples();
      for (const ex of examples) {
        expect(ex.instruction).toBeDefined();
        expect(ex.input).toBeDefined();
        expect(ex.output).toBeDefined();
        expect(ex.metadata.source).toBe('self-improvement');
      }
    });

    test('should estimate difficulty levels', () => {
      // Simple failure → beginner
      pipeline.capture({
        id: 'diff-simple',
        timestamp: Date.now(),
        prompt: 'Fix typo',
        generatedCode: 'geometry: "sper"',
        correctedCode: 'geometry: "sphere"',
        errors: ['typo'],
        fileType: '.hs',
        category: 'parse-error',
      });

      const examples = pipeline.getTrainingExamples();
      expect(examples[0].metadata.difficulty).toBe('beginner');
    });
  });

  describe('JSONL export', () => {
    test('should export valid JSONL', () => {
      pipeline.capture({
        id: 'jsonl-001',
        timestamp: Date.now(),
        prompt: 'Create a sphere',
        generatedCode: 'object "Ball" { geometry: "sper" }',
        correctedCode: 'object "Ball" { geometry: "sphere" }',
        errors: ['unknown geometry'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const jsonl = pipeline.toJSONL();
      const lines = jsonl.split('\n').filter(Boolean);

      expect(lines.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('instruction');
        expect(parsed).toHaveProperty('input');
        expect(parsed).toHaveProperty('output');
        expect(parsed).toHaveProperty('metadata');
      }
    });
  });

  describe('manual correction', () => {
    test('should accept manual corrections for pending failures', () => {
      pipeline.capture({
        id: 'manual-001',
        timestamp: Date.now(),
        prompt: 'Complex scene',
        generatedCode: 'broken code',
        errors: ['some unusual error'],
        fileType: '.holo',
        category: 'runtime-error',
      });

      // No auto-correction matches, so no examples yet
      const pending = pipeline.getPendingFailures();
      expect(pending).toHaveLength(1);

      // Provide manual correction
      pipeline.provideCorrection('manual-001', 'fixed code');

      const examples = pipeline.getTrainingExamples();
      expect(examples.length).toBeGreaterThan(0);
      expect(pipeline.getPendingFailures()).toHaveLength(0);
    });
  });

  describe('stats', () => {
    test('should track conversion rate', () => {
      // Capture with auto-correction (creates examples)
      pipeline.capture({
        id: 'rate-1',
        timestamp: Date.now(),
        prompt: 'test',
        generatedCode: 'geometry: "sper"',
        errors: ['unknown geometry type'],
        fileType: '.hsplus',
        category: 'validation-error',
      });

      const stats = pipeline.getStats();
      expect(stats.conversionRate).toBeGreaterThan(0);
    });
  });

  describe('cleanup', () => {
    test('should clear all data', () => {
      pipeline.capture({
        id: 'clear-1',
        timestamp: Date.now(),
        prompt: 'test',
        generatedCode: 'test',
        correctedCode: 'fixed',
        errors: ['error'],
        fileType: '.hs',
        category: 'parse-error',
      });

      pipeline.clear();

      expect(pipeline.getTrainingExamples()).toHaveLength(0);
      expect(pipeline.getStats().totalCaptures).toBe(0);
    });
  });
});
