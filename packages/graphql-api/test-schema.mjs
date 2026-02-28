/**
 * Test script to validate GraphQL schema generation
 * Run: node test-schema.mjs
 */

import { buildSchema } from 'type-graphql';
import { QueryResolver } from './dist/index.js';
import { CompilerResolver } from './dist/index.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 Testing GraphQL Schema Generation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

try {
  const schema = await buildSchema({
    resolvers: [QueryResolver, CompilerResolver],
    validate: true,
  });

  console.log('✅ Schema generated successfully!\n');
  console.log('Available Queries:');
  const queryType = schema.getQueryType();
  const queryFields = queryType.getFields();
  Object.keys(queryFields).forEach(field => {
    console.log(`  - ${field}`);
  });

  console.log('\nAvailable Mutations:');
  const mutationType = schema.getMutationType();
  if (mutationType) {
    const mutationFields = mutationType.getFields();
    Object.keys(mutationFields).forEach(field => {
      console.log(`  - ${field}`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Week 1 POC: GraphQL Schema Validation Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
} catch (error) {
  console.error('❌ Schema generation failed:');
  console.error(error);
  process.exit(1);
}
