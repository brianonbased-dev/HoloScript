/**
 * Tests for GraphQL API PubSub Service
 *
 * Covers:
 * - PubSub event publishing
 * - Subscription topic enum
 * - Helper publish functions
 */

import { describe, it, expect, vi } from 'vitest';
import {
  pubsub,
  SubscriptionTopic,
  publishCompilationProgress,
  publishValidationResults,
  publishCompilationComplete,
  type CompilationProgressEvent,
  type ValidationResultEvent,
  type CompilationCompleteEvent,
} from './pubsub.js';

describe('SubscriptionTopic', () => {
  it('defines expected topics', () => {
    expect(SubscriptionTopic.COMPILATION_PROGRESS).toBe('COMPILATION_PROGRESS');
    expect(SubscriptionTopic.VALIDATION_RESULTS).toBe('VALIDATION_RESULTS');
    expect(SubscriptionTopic.COMPILATION_COMPLETE).toBe('COMPILATION_COMPLETE');
  });
});

describe('pubsub instance', () => {
  it('is a valid PubSub instance', () => {
    expect(pubsub).toBeDefined();
    expect(typeof pubsub.publish).toBe('function');
    expect(typeof pubsub.asyncIterableIterator).toBe('function');
  });
});

describe('publishCompilationProgress', () => {
  it('publishes without error', () => {
    const event: CompilationProgressEvent = {
      requestId: 'req-1',
      target: 'BABYLON',
      progress: 50,
      stage: 'compiling',
      message: 'Compiling scene...',
      timestamp: Date.now(),
    };
    expect(() => publishCompilationProgress(event)).not.toThrow();
  });
});

describe('publishValidationResults', () => {
  it('publishes without error', () => {
    const event: ValidationResultEvent = {
      code: 'world test { }',
      codeHash: 'abc123',
      isValid: true,
      errors: [],
      warnings: [],
      timestamp: Date.now(),
    };
    expect(() => publishValidationResults(event)).not.toThrow();
  });
});

describe('publishCompilationComplete', () => {
  it('publishes without error', () => {
    const event: CompilationCompleteEvent = {
      requestId: 'req-2',
      target: 'UNITY',
      success: true,
      output: 'compiled output',
      errors: [],
      duration: 150,
      timestamp: Date.now(),
    };
    expect(() => publishCompilationComplete(event)).not.toThrow();
  });
});
