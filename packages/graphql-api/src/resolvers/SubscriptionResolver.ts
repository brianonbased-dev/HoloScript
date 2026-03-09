import { Resolver, Subscription, Root, Arg, Mutation } from 'type-graphql';
import { createHash } from 'crypto';
import {
  CompilationProgressPayload,
  ValidationResultPayload,
  ValidationInput,
  ParseResult,
} from '../types/GraphQLTypes.js';
import {
  pubsub,
  SubscriptionTopic,
  publishValidationResults,
  type CompilationProgressEvent,
  type ValidationResultEvent,
} from '../services/pubsub.js';

/**
 * Subscription Resolver for real-time updates
 * Week 3: Real-time compilation progress and validation
 */
@Resolver()
export class SubscriptionResolver {
  /**
   * Subscribe to compilation progress updates
   * Emits progress events during batch compilation
   */
  @Subscription(() => CompilationProgressPayload, {
    description: 'Real-time compilation progress updates',
    topics: SubscriptionTopic.COMPILATION_PROGRESS,
  })
  compilationProgress(
    @Root() payload: { compilationProgress: CompilationProgressEvent },
    @Arg('requestId', () => String, { nullable: true }) requestId?: string
  ): CompilationProgressPayload {
    const event = payload.compilationProgress;

    // Filter by requestId if specified
    if (requestId && event.requestId !== requestId) {
      return null as any; // Skip this event
    }

    return {
      requestId: event.requestId,
      target: event.target,
      progress: event.progress,
      stage: event.stage as any,
      message: event.message,
      timestamp: event.timestamp,
    };
  }

  /**
   * Subscribe to validation results
   * Emits validation results in real-time as code is typed
   */
  @Subscription(() => ValidationResultPayload, {
    description: 'Real-time code validation results',
    topics: SubscriptionTopic.VALIDATION_RESULTS,
  })
  validationResults(
    @Root() payload: { validationResults: ValidationResultEvent }
  ): ValidationResultPayload {
    const event = payload.validationResults;

    return {
      codeHash: event.codeHash,
      isValid: event.isValid,
      errors: event.errors,
      warnings: event.warnings,
      timestamp: event.timestamp,
    };
  }

  /**
   * Validate HoloScript code and optionally publish to subscribers
   * This mutation triggers validation and publishes results to subscription
   */
  @Mutation(() => ParseResult, {
    description: 'Validate HoloScript code and publish results to subscribers',
  })
  async validateCode(
    @Arg('input', () => ValidationInput) input: ValidationInput
  ): Promise<ParseResult> {
    try {
      // Dynamic import to avoid ESM/CJS interop issues
      const { HoloScriptPlusParser } = await import('@holoscript/core');

      const parser = new HoloScriptPlusParser();
      const result = parser.parse(input.code);

      // Generate code hash for deduplication
      const codeHash = createHash('sha256').update(input.code).digest('hex').substring(0, 16);

      const astJson = result.ast ? JSON.stringify(result.ast, null, 2) : undefined;

      // Publish validation results if real-time is enabled
      if (input.realTime) {
        const validationEvent: ValidationResultEvent = {
          code: input.code,
          codeHash,
          isValid: !!result.ast && (!result.errors || result.errors.length === 0),
          errors:
            result.errors?.map((e: any) => ({
              message: e.message,
              line: e.location?.line,
              column: e.location?.column,
            })) || [],
          warnings:
            result.warnings?.map((w: any) => ({
              message: w.message,
              line: w.location?.line,
              column: w.location?.column,
            })) || [],
          timestamp: Date.now(),
        };

        publishValidationResults(validationEvent);
      }

      return {
        success: !!result.ast,
        ast: astJson,
        errors: result.errors || [],
        warnings: result.warnings || [],
      };
    } catch (error: any) {
      const codeHash = createHash('sha256').update(input.code).digest('hex').substring(0, 16);

      // Publish error event
      if (input.realTime) {
        publishValidationResults({
          code: input.code,
          codeHash,
          isValid: false,
          errors: [{ message: error.message || 'Unknown validation error' }],
          warnings: [],
          timestamp: Date.now(),
        });
      }

      return {
        success: false,
        ast: undefined,
        errors: [
          {
            message: error.message || 'Unknown validation error',
            location: error.location,
            code: error.code,
          },
        ],
        warnings: [],
      };
    }
  }
}
