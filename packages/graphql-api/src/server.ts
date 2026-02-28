import 'reflect-metadata';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import cors from 'cors';
import bodyParser from 'body-parser';
import { buildSchema } from 'type-graphql';
import { QueryResolver } from './resolvers/QueryResolver.js';
import { CompilerResolver } from './resolvers/CompilerResolver.js';
import {
  BatchCompilerResolver,
  createCompilationLoader,
  type GraphQLContext,
} from './resolvers/BatchCompilerResolver.js';
import { SubscriptionResolver } from './resolvers/SubscriptionResolver.js';
import { createComplexityPlugin } from './plugins/complexityPlugin.js';
import { createCachePlugin } from './plugins/cachePlugin.js';
import { createRateLimitPlugin, OPERATION_RATE_LIMITS } from './plugins/rateLimitPlugin.js';
import { createAuthPlugin } from './plugins/authPlugin.js';
import { pubsub } from './services/pubsub.js';

/**
 * Start the GraphQL server with WebSocket support for subscriptions
 * Week 3: Real-time features via WebSocket subscriptions
 */
export async function startServer() {
  // Build GraphQL schema from TypeGraphQL resolvers
  const schema = await buildSchema({
    resolvers: [
      QueryResolver,
      CompilerResolver,
      BatchCompilerResolver,
      SubscriptionResolver,
    ],
    validate: true,
    pubSub: pubsub, // Required for subscriptions
  });

  // Create Express app
  const app = express();
  const httpServer = createServer(app);

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Setup GraphQL-WS subscription server
  const serverCleanup = useServer(
    {
      schema,
      context: async (): Promise<GraphQLContext> => ({
        compilationLoader: createCompilationLoader(),
      }),
    },
    wsServer
  );

  // Create Apollo Server with HTTP drain plugin
  const server = new ApolloServer<GraphQLContext>({
    schema,
    introspection: true,
    plugins: [
      // Proper shutdown for HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),

      // Proper shutdown for WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },

      // Query complexity limits (Week 3)
      createComplexityPlugin({
        maximumComplexity: 2000, // Allow up to 2000 complexity points
        includeComplexityInExtensions: true,
      }),

      // Response caching (Week 3)
      createCachePlugin({
        ttl: 5 * 60 * 1000, // 5 minutes
        maxSize: 1000,
        cacheableOperations: ['listTargets', 'getTargetInfo', 'parseHoloScript'],
        includeCacheStatusInExtensions: true,
      }),

      // Rate limiting (Week 4)
      createRateLimitPlugin({
        max: 1000, // Global: 1000 requests per 15 minutes
        window: 15 * 60 * 1000,
        perOperationLimits: OPERATION_RATE_LIMITS,
        includeHeaders: true,
      }),

      // Authentication (Week 4)
      createAuthPlugin({
        requireAuth: process.env.REQUIRE_AUTH === 'true',
        publicOperations: ['listTargets', 'getTargetInfo'],
        includeAuthStatusInExtensions: true,
      }),

      // Error logging
      {
        async requestDidStart() {
          return {
            async didEncounterErrors(ctx) {
              console.error('[GraphQL Error]', ctx.errors);
            },
          };
        },
      },
    ],
  });

  await server.start();

  // Setup Express middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    bodyParser.json(),
    expressMiddleware(server, {
      context: async (): Promise<GraphQLContext> => ({
        compilationLoader: createCompilationLoader(),
      }),
    })
  );

  // Start HTTP server
  const PORT = process.env.PORT || 4000;
  await new Promise<void>((resolve) => httpServer.listen({ port: PORT }, resolve));

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 HoloScript GraphQL API Server (Week 3 - Real-time Edition)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🌐 HTTP Server:       http://localhost:${PORT}/graphql`);
  console.log(`📡 WebSocket Server:  ws://localhost:${PORT}/graphql`);
  console.log(`📊 GraphQL Playground: http://localhost:${PORT}/graphql`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('Available Features:');
  console.log('');
  console.log('✅ Queries:');
  console.log('   - parseHoloScript: Parse HoloScript code to AST');
  console.log('   - listTargets: List all compiler targets');
  console.log('   - getTargetInfo: Get detailed target information');
  console.log('');
  console.log('✅ Mutations:');
  console.log('   - compile: Single file compilation');
  console.log('   - batchCompile: Batch compilation with DataLoader');
  console.log('   - validateCode: Real-time code validation');
  console.log('');
  console.log('✅ Subscriptions (NEW - Week 3):');
  console.log('   - compilationProgress: Real-time compilation updates');
  console.log('   - validationResults: Live validation feedback');
  console.log('');
  console.log('Example Subscription:');
  console.log('');
  console.log('subscription LiveValidation {');
  console.log('  validationResults {');
  console.log('    codeHash');
  console.log('    isValid');
  console.log('    errors { message line column }');
  console.log('    warnings { message line column }');
  console.log('  }');
  console.log('}');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { server, app, httpServer };
}

// Run server if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
