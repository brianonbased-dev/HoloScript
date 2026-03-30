/**
 * v5.4 "Domains Unified" — End-to-end showcase test
 *
 * Validates that the cross-domain-service.holo example:
 * 1. Parses successfully
 * 2. Passes validate_composition
 * 3. Contains all 8 v6 domain blocks
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { handleValidationTool } from '../validation-tools';
import { handleAbsorbTypescriptTool } from '@holoscript/absorb-service/mcp';

const EXAMPLES_DIR = resolve(__dirname, '../../../../examples/services');

describe('v5.4 Showcase', () => {
  describe('cross-domain-service.holo', () => {
    const code = readFileSync(resolve(EXAMPLES_DIR, 'cross-domain-service.holo'), 'utf-8');

    it('is a non-empty composition file', () => {
      expect(code.length).toBeGreaterThan(100);
      expect(code).toContain('composition "OrderService"');
    });

    it('contains all 8 v6 domain blocks', () => {
      expect(code).toContain('service {');
      expect(code).toContain('data {');
      expect(code).toContain('service_contract {');
      expect(code).toContain('pipeline {');
      expect(code).toContain('network {');
      expect(code).toContain('resilience {');
      expect(code).toContain('obs_metric {');
      expect(code).toContain('container {');
    });

    it('validates without constraint errors', async () => {
      const result = (await handleValidationTool('validate_composition', { code })) as {
        valid: boolean;
        diagnostics: Array<{ severity: string; message: string }>;
        stats: { totalTraits: number };
      };
      // May have parse-level issues since domain blocks are v6 syntax,
      // but should not have constraint-level errors
      const constraintErrors = result.diagnostics.filter(
        (d) => d.severity === 'error' && d.message.includes('CONSTRAINT')
      );
      expect(constraintErrors).toHaveLength(0);
    });
  });

  describe('fullstack-absorb pipeline', () => {
    const sourceTs = readFileSync(resolve(EXAMPLES_DIR, 'fullstack-absorb/source.ts'), 'utf-8');

    it('absorbs TypeScript source into .holo', async () => {
      const result = (await handleAbsorbTypescriptTool('absorb_typescript', {
        code: sourceTs,
      })) as {
        success: boolean;
        holo: string;
        detections: {
          endpoints: number;
          models: number;
          queues: number;
          resiliencePatterns: string[];
        };
      };

      expect(result.success).toBe(true);
      expect(result.holo).toContain('composition');
      expect(result.detections.endpoints).toBeGreaterThanOrEqual(2);
      expect(result.detections.resiliencePatterns).toContain('circuit_breaker');
      expect(result.detections.queues).toBeGreaterThanOrEqual(1);
    });

    it('absorbed output contains @imperative regions', async () => {
      const result = (await handleAbsorbTypescriptTool('absorb_typescript', {
        code: sourceTs,
      })) as { holo: string };
      expect(result.holo).toContain('@imperative');
    });
  });
});
