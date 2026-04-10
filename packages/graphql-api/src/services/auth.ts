/**
 * Authentication Service (GraphQL API)
 *
 * Thin re-export layer over @holoscript/auth with GraphQLError mapping.
 * All core JWT logic lives in the shared @holoscript/auth package so that
 * both graphql-api and marketplace-api use the same implementation.
 */

// Re-export everything from the shared auth package
export {
  AuthService,
  AuthError,
  authService,
  PERMISSIONS,
  ROLES,
  type UserPayload,
  type AuthContext,
  type AuthConfig,
} from '@holoscript/auth';
