/**
 * Authentication Plugin
 * Week 4: JWT authentication middleware for Apollo Server
 */

import { ApolloServerPlugin, GraphQLRequestListener, BaseContext } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { authService, type AuthContext } from '../services/auth.js';

export interface AuthPluginOptions {
  /**
   * Whether authentication is required globally
   * Default: false (allows anonymous access)
   */
  requireAuth?: boolean;

  /**
   * Operations that don't require authentication
   * Default: ['listTargets', 'getTargetInfo']
   */
  publicOperations?: string[];

  /**
   * Whether to include auth status in response extensions
   * Default: true in development
   */
  includeAuthStatusInExtensions?: boolean;
}

/**
 * Creates an Apollo Server plugin for JWT authentication
 *
 * Authentication flow:
 * 1. Extract JWT from Authorization header (Bearer token)
 * 2. Verify token and extract user payload
 * 3. Add user to GraphQL context
 * 4. Enforce authentication rules per operation
 *
 * Public operations (no auth required):
 * - listTargets
 * - getTargetInfo
 * - __schema, __type (introspection)
 *
 * Protected operations (auth required):
 * - compile, batchCompile
 * - validateCode
 * - parseHoloScript
 *
 * Authentication header format:
 * ```
 * Authorization: Bearer <jwt-token>
 * ```
 *
 * Error codes:
 * - UNAUTHENTICATED: No valid token provided
 * - FORBIDDEN: Token valid but lacks permissions
 * - TOKEN_EXPIRED: Token has expired
 * - INVALID_TOKEN: Token is malformed or invalid
 */
export function createAuthPlugin(
  options: AuthPluginOptions = {}
): ApolloServerPlugin<BaseContext> {
  const includeStatus = options.includeAuthStatusInExtensions ?? process.env.NODE_ENV !== 'production';

  return {
    async requestDidStart(requestContext): Promise<GraphQLRequestListener<BaseContext>> {
      let authContext: AuthContext | undefined;
      let operationName: string | undefined;

      return {
        async didResolveOperation({ request }) {
          operationName = request.operationName;

          // Extract auth header from request
          const authHeader = requestContext.request.http?.headers.get('authorization');

          // Authenticate request
          authContext = authService.authenticate(authHeader);

          // Store auth context in request for access in resolvers
          (request as any).authContext = authContext;

          // Check if operation requires authentication
          const isPublic = authService.isPublicOperation(operationName);
          const requireAuth = options.requireAuth ?? false;

          if (!isPublic && requireAuth && !authContext.isAuthenticated) {
            throw new GraphQLError(
              `Authentication required for operation "${operationName || 'unknown'}". Please provide a valid JWT token.`,
              {
                extensions: {
                  code: 'UNAUTHENTICATED',
                  operation: operationName,
                },
              }
            );
          }

          // Check operation-specific permissions
          if (!isPublic && authContext.isAuthenticated) {
            const canPerform = authService.canPerformOperation(authContext.user, operationName || '');

            if (!canPerform) {
              throw new GraphQLError(
                `Insufficient permissions for operation "${operationName || 'unknown'}".`,
                {
                  extensions: {
                    code: 'FORBIDDEN',
                    operation: operationName,
                    userRoles: authContext.user?.roles || [],
                  },
                }
              );
            }
          }

          // Log authentication events
          if (authContext.isAuthenticated) {
            console.log(
              `[Auth] User ${authContext.user?.id} performed ${operationName || 'unknown'}`
            );
          } else if (!isPublic) {
            console.log(
              `[Auth] Anonymous access to ${operationName || 'unknown'} (public operation)`
            );
          }
        },

        async willSendResponse({ response }) {
          // Add auth status to extensions
          if (includeStatus && authContext && response.body.kind === 'single') {
            response.body.singleResult.extensions = {
              ...response.body.singleResult.extensions,
              auth: {
                isAuthenticated: authContext.isAuthenticated,
                userId: authContext.user?.id,
                roles: authContext.user?.roles || [],
              },
            };
          }
        },
      };
    },
  };
}

/**
 * Helper function to get auth context from GraphQL context
 * Use in resolvers to access current user
 *
 * Example:
 * ```typescript
 * @Mutation(() => CompilePayload)
 * async compile(
 *   @Arg('input') input: CompileInput,
 *   @Ctx() ctx: GraphQLContext
 * ): Promise<CompilePayload> {
 *   const authCtx = getAuthContext(ctx);
 *   if (!authCtx.isAuthenticated) {
 *     throw new Error('Authentication required');
 *   }
 *   // ... compilation logic
 * }
 * ```
 */
export function getAuthContext(context: any): AuthContext {
  return context.authContext || { user: null, isAuthenticated: false };
}
