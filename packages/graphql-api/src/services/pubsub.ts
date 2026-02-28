/**
 * PubSub singleton for GraphQL subscriptions
 * Provides centralized event publishing for real-time updates
 */

import { PubSub } from 'graphql-subscriptions';

/**
 * Subscription event topics
 */
export enum SubscriptionTopic {
  COMPILATION_PROGRESS = 'COMPILATION_PROGRESS',
  VALIDATION_RESULTS = 'VALIDATION_RESULTS',
  COMPILATION_COMPLETE = 'COMPILATION_COMPLETE',
}

/**
 * Event payload types
 */
export interface CompilationProgressEvent {
  requestId: string;
  target: string;
  progress: number; // 0-100
  stage: 'parsing' | 'compiling' | 'optimizing' | 'complete' | 'error';
  message: string;
  timestamp: number;
}

export interface ValidationResultEvent {
  code: string;
  codeHash: string;
  isValid: boolean;
  errors: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
  warnings: Array<{
    message: string;
    line?: number;
    column?: number;
  }>;
  timestamp: number;
}

export interface CompilationCompleteEvent {
  requestId: string;
  target: string;
  success: boolean;
  output?: string;
  errors: string[];
  duration: number;
  timestamp: number;
}

/**
 * Global PubSub instance
 * For production, replace with Redis PubSub for horizontal scaling
 */
export const pubsub = new PubSub();

/**
 * Helper function to publish compilation progress
 */
export function publishCompilationProgress(event: CompilationProgressEvent): void {
  pubsub.publish(SubscriptionTopic.COMPILATION_PROGRESS, {
    compilationProgress: event,
  });
}

/**
 * Helper function to publish validation results
 */
export function publishValidationResults(event: ValidationResultEvent): void {
  pubsub.publish(SubscriptionTopic.VALIDATION_RESULTS, {
    validationResults: event,
  });
}

/**
 * Helper function to publish compilation complete
 */
export function publishCompilationComplete(event: CompilationCompleteEvent): void {
  pubsub.publish(SubscriptionTopic.COMPILATION_COMPLETE, {
    compilationComplete: event,
  });
}
