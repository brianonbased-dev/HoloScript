/**
 * Minimal test - just build the schema
 */

import { buildSchema } from 'type-graphql';

// Import types directly
import 'reflect-metadata';

console.log('Importing resolvers...');
const { QueryResolver, CompilerResolver, BatchCompilerResolver, SubscriptionResolver, pubsub } =
  await import('./dist/index.js');

console.log('Building schema...');
const schema = await buildSchema({
  resolvers: [QueryResolver, CompilerResolver, BatchCompilerResolver, SubscriptionResolver],
  validate: true,
  pubSub: pubsub, // Required for subscriptions
});

console.log('✅ Schema built successfully!');

// Print available operations
const queryType = schema.getQueryType();
console.log('\n✅ Queries:', Object.keys(queryType.getFields()).join(', '));

const mutationType = schema.getMutationType();
if (mutationType) {
  console.log('✅ Mutations:', Object.keys(mutationType.getFields()).join(', '));
}

const subscriptionType = schema.getSubscriptionType();
if (subscriptionType) {
  console.log('✅ Subscriptions:', Object.keys(subscriptionType.getFields()).join(', '));
}

console.log('\n🎉 GraphQL API Week 3 (Real-time Features) is working!');
process.exit(0);
