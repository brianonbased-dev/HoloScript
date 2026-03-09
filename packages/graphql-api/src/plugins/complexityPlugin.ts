/**
 * Query Complexity Analysis Plugin
 * Week 3: Prevents expensive queries from overwhelming the server
 */

import { ApolloServerPlugin, GraphQLRequestListener, BaseContext } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { fieldExtensionsEstimator, getComplexity, simpleEstimator } from 'graphql-query-complexity';
import type { GraphQLSchema } from 'graphql';

export interface ComplexityPluginOptions {
  /**
   * Maximum allowed complexity for a single query
   * Default: 1000
   */
  maximumComplexity?: number;

  /**
   * Whether to include complexity in response extensions
   * Useful for debugging and optimization
   * Default: true in development
   */
  includeComplexityInExtensions?: boolean;

  /**
   * Custom error message function
   */
  createError?: (max: number, actual: number) => string;
}

const DEFAULT_MAX_COMPLEXITY = 1000;

/**
 * Creates an Apollo Server plugin for query complexity analysis
 *
 * Complexity scoring:
 * - Simple fields: 1 point
 * - Queries: 1 point
 * - Mutations: 10 points (writes are expensive)
 * - Subscriptions: 5 points (long-lived connections)
 * - Batch operations: multiplied by array length
 *
 * Example complexity scores:
 * - parseHoloScript: ~5 points
 * - compile: ~15 points
 * - batchCompile (10 files): ~150 points
 * - validationResults subscription: ~10 points
 */
export function createComplexityPlugin(
  options: ComplexityPluginOptions = {}
): ApolloServerPlugin<BaseContext> {
  const maxComplexity = options.maximumComplexity ?? DEFAULT_MAX_COMPLEXITY;
  const includeInExtensions =
    options.includeComplexityInExtensions ?? process.env.NODE_ENV !== 'production';
  const createError =
    options.createError ??
    ((max, actual) =>
      `Query is too complex: ${actual} exceeds maximum complexity of ${max}. Please simplify your query or batch fewer operations.`);

  return {
    async requestDidStart(): Promise<GraphQLRequestListener<BaseContext>> {
      return {
        async didResolveOperation({ request, document, schema }) {
          try {
            const complexity = getComplexity({
              schema: schema as GraphQLSchema,
              query: document,
              variables: request.variables,
              estimators: [
                // Use field-level complexity hints if available
                fieldExtensionsEstimator(),
                // Fallback to simple estimation (1 per field)
                simpleEstimator({ defaultComplexity: 1 }),
              ],
            });

            if (complexity > maxComplexity) {
              throw new GraphQLError(createError(maxComplexity, complexity), {
                extensions: {
                  code: 'QUERY_TOO_COMPLEX',
                  complexity,
                  maxComplexity,
                },
              });
            }

            // Log complexity for monitoring
            if (complexity > maxComplexity * 0.5) {
              console.warn(`[Complexity Warning] Query complexity: ${complexity}/${maxComplexity}`);
            }

            // Include complexity in response extensions for debugging
            if (includeInExtensions) {
              // Store complexity for inclusion in response
              (request as any).__complexity = complexity;
            }
          } catch (error) {
            if (error instanceof GraphQLError) {
              throw error;
            }
            // Log but don't fail on complexity calculation errors
            console.error('[Complexity Plugin] Error calculating complexity:', error);
          }
        },

        async willSendResponse({ response, request }) {
          // Add complexity to extensions if enabled
          if (includeInExtensions && (request as any).__complexity) {
            response.body.kind = 'single';
            if (response.body.kind === 'single') {
              response.body.singleResult.extensions = {
                ...response.body.singleResult.extensions,
                complexity: (request as any).__complexity,
                maxComplexity,
              };
            }
          }
        },
      };
    },
  };
}

/**
 * Complexity hints for TypeGraphQL decorators
 * Use these in resolver decorators to provide custom complexity scores
 *
 * Example:
 * @Query(() => CompilePayload, {
 *   complexity: ({ childComplexity, args }) => childComplexity * args.inputs.length
 * })
 */
export const COMPLEXITY_HINTS = {
  SIMPLE_QUERY: 1,
  PARSE_QUERY: 5,
  COMPILE_MUTATION: 10,
  BATCH_COMPILE_BASE: 10,
  SUBSCRIPTION_BASE: 5,
} as const;
