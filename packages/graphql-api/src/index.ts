/**
 * @holoscript/graphql-api
 *
 * GraphQL API layer for HoloScript v3.42.0 compiler
 * Provides TypeGraphQL-based API with Apollo Server integration
 *
 * Features:
 * - Week 1: Parse, compile, list targets (POC)
 * - Week 2: Batch compilation with DataLoader (12+ targets)
 * - Week 3: Real-time subscriptions, caching, complexity limits
 * - Week 4: Rate limiting, JWT authentication, authorization
 *
 * @version 0.4.0
 * @author Brian X Base Team
 */

import 'reflect-metadata';

// Export types
export * from './types/GraphQLTypes.js';

// Export resolvers
export { QueryResolver } from './resolvers/QueryResolver.js';
export { CompilerResolver } from './resolvers/CompilerResolver.js';
export {
  BatchCompilerResolver,
  createCompilationLoader,
  type GraphQLContext,
} from './resolvers/BatchCompilerResolver.js';
export { SubscriptionResolver } from './resolvers/SubscriptionResolver.js';

// Export PubSub utilities
export {
  pubsub,
  SubscriptionTopic,
  publishCompilationProgress,
  publishValidationResults,
  publishCompilationComplete,
} from './services/pubsub.js';

// Export authentication (Week 4)
export {
  authService,
  AuthService,
  type UserPayload,
  type AuthContext,
  type AuthConfig,
  PERMISSIONS,
  ROLES,
} from './services/auth.js';

export { getAuthContext } from './plugins/authPlugin.js';

// Export server setup function
export { startServer } from './server.js';
