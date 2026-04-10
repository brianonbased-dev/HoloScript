/**
 * Tests for HoloScript Error Recovery System
 *
 * Covers:
 * - Error creation with codes and suggestions
 * - Error analysis from raw messages
 * - Error formatting for display
 * - Error collection and state management
 * - Suggestion generation for common mistakes
 */

import { describe, it, expect } from 'vitest';
import { ErrorRecovery } from './ErrorRecovery';

describe('ErrorRecovery', () => {
  describe('createError', () => {
    it('creates error with code and message', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.createError('MISSING_BRACE', 'Missing closing brace', 10, 5);
      expect(error.code).toBe('MISSING_BRACE');
      expect(error.message).toBe('Missing closing brace');
      expect(error.line).toBe(10);
      expect(error.column).toBe(5);
    });

    it('includes source when provided', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.createError('MISSING_COLON', 'Expected colon', 5, 10, 'name "test"');
      expect(error.source).toBe('name "test"');
    });

    it('generates suggestions for MISSING_BRACE', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.createError('MISSING_BRACE', 'unterminated block', 10, 5);
      expect(error.suggestions).toBeDefined();
      expect(error.suggestions!.length).toBeGreaterThan(0);
    });

    it('generates suggestions for UNKNOWN_KEYWORD', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.createError('UNKNOWN_KEYWORD', 'unknown keyword compostion', 1, 1);
      expect(error.suggestions).toBeDefined();
    });
  });

  describe('analyzeError', () => {
    it('recognizes missing brace pattern', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.analyzeError('unexpected end of input', 'state { x: 1', 5, 1);
      expect(error.code).toBe('MISSING_BRACE');
    });

    it('recognizes missing colon pattern', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.analyzeError('expected :', 'name "test"', 3, 5);
      expect(error.code).toBe('MISSING_COLON');
    });

    it('recognizes unterminated string pattern', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.analyzeError('unterminated string literal', 'name: "hello', 2, 7);
      expect(error.code).toBe('MISSING_QUOTE');
    });

    it('provides default code for unrecognized errors', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.analyzeError('something totally unknown', '', 1, 1);
      expect(error.code).toBeDefined();
      expect(error.line).toBe(1);
    });
  });

  describe('formatError', () => {
    it('formats error with line and column', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.createError('MISSING_BRACE', 'Missing closing brace', 10, 5);
      const formatted = recovery.formatError(error);
      expect(formatted).toContain('10');
      expect(formatted).toContain('5');
      expect(formatted).toContain('Missing closing brace');
    });

    it('includes suggestions in formatted output', () => {
      const recovery = new ErrorRecovery();
      const error = recovery.createError('MISSING_BRACE', 'unterminated block', 10, 1);
      if (error.suggestions && error.suggestions.length > 0) {
        const formatted = recovery.formatError(error);
        expect(formatted.length).toBeGreaterThan(20);
      }
    });
  });

  describe('error collection', () => {
    it('starts with no errors', () => {
      const recovery = new ErrorRecovery();
      expect(recovery.hasErrors()).toBe(false);
      expect(recovery.getErrors()).toEqual([]);
    });

    it('clears errors', () => {
      const recovery = new ErrorRecovery();
      recovery.createError('MISSING_BRACE', 'test', 1, 1);
      recovery.clear();
      expect(recovery.hasErrors()).toBe(false);
    });
  });
});
