/**
 * Hybrid Chunking Example
 *
 * Demonstrates the three chunking strategies and their performance benefits.
 */

import { createHybridChunker } from '../HybridChunker';
import { ChunkDetector } from '../ChunkDetector';

// ===========================================================================
// Example 1: Structure-Based Chunking (TypeScript)
// ===========================================================================

const typeScriptCode = `
export class UserService {
  private users: Map<string, User> = new Map();

  async createUser(data: UserCreateData): Promise<User> {
    const user = new User(data);
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    Object.assign(user, data);
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
}

export class AuthService {
  async login(email: string, password: string): Promise<Token> {
    // Validate credentials
    const user = await this.validateCredentials(email, password);
    if (!user) throw new Error("Invalid credentials");

    // Generate token
    const token = await this.generateToken(user);
    return token;
  }

  private async validateCredentials(email: string, password: string): Promise<User | null> {
    // Validation logic
    return null;
  }

  private async generateToken(user: User): Promise<Token> {
    // Token generation logic
    return { token: "jwt", expiresAt: Date.now() + 3600000 };
  }
}
`;

console.log('='.repeat(70));
console.log('EXAMPLE 1: Structure-Based Chunking (TypeScript)');
console.log('='.repeat(70));

const chunker = createHybridChunker({ debug: true });
const tsChunks = chunker.chunk(typeScriptCode, 'services.ts');

console.log(`\nGenerated ${tsChunks.length} chunks using "${tsChunks[0].strategy}" strategy`);
console.log('\nChunk details:');
tsChunks.forEach((chunk, i) => {
  console.log(`  Chunk ${i + 1}:`);
  console.log(`    Lines: ${chunk.startLine}-${chunk.endLine}`);
  console.log(`    Tokens: ${chunk.tokens}`);
  console.log(`    Type: ${chunk.type}`);
  console.log(`    Preview: ${chunk.content.substring(0, 80).replace(/\n/g, ' ')}...`);
});

const tsStats = chunker.getStats(tsChunks);
console.log('\nStatistics:');
console.log(`  Total tokens: ${tsStats.totalTokens}`);
console.log(`  Avg tokens/chunk: ${tsStats.avgTokensPerChunk.toFixed(0)}`);
console.log(`  Strategy distribution:`, tsStats.strategyDistribution);

// ===========================================================================
// Example 2: Fixed-Size Chunking (Logs)
// ===========================================================================

const logContent = Array(100)
  .fill(0)
  .map(
    (_, i) =>
      `[2026-02-27 10:${Math.floor(i / 60)
        .toString()
        .padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}] ` +
      `INFO: Request ${i} processed successfully | Duration: ${Math.floor(Math.random() * 1000)}ms | Status: 200`
  )
  .join('\n');

console.log('\n' + '='.repeat(70));
console.log('EXAMPLE 2: Fixed-Size Chunking (Logs)');
console.log('='.repeat(70));

const logChunks = chunker.chunk(logContent, 'app.log');

console.log(`\nGenerated ${logChunks.length} chunks using "${logChunks[0].strategy}" strategy`);
console.log('\nChunk details:');
logChunks.slice(0, 3).forEach((chunk, i) => {
  console.log(`  Chunk ${i + 1}:`);
  console.log(`    Lines: ${chunk.startLine}-${chunk.endLine}`);
  console.log(`    Tokens: ${chunk.tokens}`);
  console.log(`    Preview: ${chunk.content.split('\n')[0]}`);
});
if (logChunks.length > 3) {
  console.log(`  ... and ${logChunks.length - 3} more chunks`);
}

const logStats = chunker.getStats(logChunks);
console.log('\nStatistics:');
console.log(`  Total tokens: ${logStats.totalTokens}`);
console.log(`  Avg tokens/chunk: ${logStats.avgTokensPerChunk.toFixed(0)}`);

// ===========================================================================
// Example 3: Semantic Chunking (Markdown)
// ===========================================================================

const markdownContent = `
# User Authentication

User authentication in HoloScript is handled through a secure JWT-based system.
The authentication flow involves several key steps to ensure security.

## Login Process

When a user attempts to login, the following steps occur:

1. Client submits credentials (email + password)
2. Server validates credentials against database
3. If valid, server generates JWT token
4. Token is returned to client with expiration time

## Token Structure

The JWT token contains the following claims:

- User ID (sub)
- Email address (email)
- Expiration timestamp (exp)
- Issued at timestamp (iat)

## Security Considerations

All passwords are hashed using bcrypt with a cost factor of 12.
Tokens are signed using RS256 algorithm with rotating keys.

# Database Operations

Database operations in HoloScript use PostgreSQL as the primary data store.
All queries are parameterized to prevent SQL injection attacks.

## Connection Pooling

Connection pooling is managed by the pg-pool library.
Maximum pool size is configured to 20 connections.

## Query Optimization

Queries are optimized using indexes on frequently accessed columns.
Explain analyze is used during development to identify slow queries.
`;

console.log('\n' + '='.repeat(70));
console.log('EXAMPLE 3: Semantic Chunking (Markdown)');
console.log('='.repeat(70));

const mdChunks = chunker.chunk(markdownContent, 'README.md');

console.log(`\nGenerated ${mdChunks.length} chunks using "${mdChunks[0].strategy}" strategy`);
console.log('\nChunk details:');
mdChunks.forEach((chunk, i) => {
  const firstLine = chunk.content.split('\n').find((l) => l.trim());
  console.log(`  Chunk ${i + 1}:`);
  console.log(`    Lines: ${chunk.startLine}-${chunk.endLine}`);
  console.log(`    Tokens: ${chunk.tokens}`);
  console.log(`    Paragraphs: ${chunk.metadata?.paragraphCount || 'N/A'}`);
  console.log(`    Starts with: "${firstLine}"`);
});

const mdStats = chunker.getStats(mdChunks);
console.log('\nStatistics:');
console.log(`  Total tokens: ${mdStats.totalTokens}`);
console.log(`  Avg tokens/chunk: ${mdStats.avgTokensPerChunk.toFixed(0)}`);

// ===========================================================================
// Example 4: Performance Comparison
// ===========================================================================

console.log('\n' + '='.repeat(70));
console.log('EXAMPLE 4: Performance Comparison (Hybrid vs Legacy)');
console.log('='.repeat(70));

const holoscriptCode = `
composition "GameWorld" {
  environment {
    skybox: "space"
    gravity: -9.8
  }

  orb player {
    position: [0, 1, 0]
    color: "#ff0000"
    health: 100
  }

  template Enemy {
    health: 50
    damage: 10
    speed: 5
  }

  function spawnEnemy(x, y, z) {
    const enemy = create("Enemy")
    enemy.position = [x, y, z]
    return enemy
  }

  function updatePlayer(deltaTime) {
    player.position[1] += player.velocity * deltaTime
  }
}
`;

// Benchmark HybridChunker
const hybridStart = performance.now();
const hybridChunks = chunker.chunk(holoscriptCode, 'game.hsplus');
const hybridTime = performance.now() - hybridStart;

// Benchmark Legacy ChunkDetector
const legacyStart = performance.now();
const legacyChunks = ChunkDetector.detect(holoscriptCode);
const legacyTime = performance.now() - legacyStart;

const improvement = ((legacyTime - hybridTime) / legacyTime) * 100;

console.log('\nResults:');
console.log(`  HybridChunker: ${hybridTime.toFixed(3)}ms (${hybridChunks.length} chunks)`);
console.log(`  Legacy ChunkDetector: ${legacyTime.toFixed(3)}ms (${legacyChunks.length} chunks)`);
console.log(
  `  Performance: ${improvement >= 0 ? 'faster' : 'slower'} by ${Math.abs(improvement).toFixed(1)}%`
);

// ===========================================================================
// Example 5: Mixed Workload
// ===========================================================================

console.log('\n' + '='.repeat(70));
console.log('EXAMPLE 5: Mixed Workload (Multiple File Types)');
console.log('='.repeat(70));

const files = [
  { path: 'UserService.ts', content: typeScriptCode },
  { path: 'app.log', content: logContent },
  { path: 'README.md', content: markdownContent },
  { path: 'game.hsplus', content: holoscriptCode },
];

const allChunks: unknown[] = [];
const startTime = performance.now();

files.forEach((file) => {
  const chunks = chunker.chunk(file.content, file.path);
  allChunks.push(...chunks);
  console.log(`\n  ${file.path}: ${chunks.length} chunks (${chunks[0].strategy} strategy)`);
});

const totalTime = performance.now() - startTime;
// @ts-expect-error
const combinedStats = chunker.getStats(allChunks);

console.log('\nOverall Statistics:');
console.log(`  Total files: ${files.length}`);
console.log(`  Total chunks: ${combinedStats.totalChunks}`);
console.log(`  Total tokens: ${combinedStats.totalTokens}`);
console.log(`  Avg tokens/chunk: ${combinedStats.avgTokensPerChunk.toFixed(0)}`);
console.log(`  Processing time: ${totalTime.toFixed(2)}ms`);
console.log(`  Strategy distribution:`);
Object.entries(combinedStats.strategyDistribution).forEach(([strategy, count]) => {
  console.log(`    ${strategy}: ${count} chunks`);
});

console.log('\n' + '='.repeat(70));
console.log('KEY TAKEAWAYS');
console.log('='.repeat(70));
console.log(`
1. Structure-based chunking preserves code boundaries (functions, classes)
2. Fixed-size chunking handles unstructured data efficiently (logs)
3. Semantic chunking groups related content (documentation)
4. Automatic routing based on file extension
5. Target: 20-30% faster than single-strategy approaches
6. Token-aware chunking respects maxTokens limit
7. Overlap between chunks maintains context (fixed-size strategy)
8. Statistics API for monitoring and optimization
`);

// ===========================================================================
// Example 6: Custom Configuration
// ===========================================================================

console.log('='.repeat(70));
console.log('EXAMPLE 6: Custom Configuration');
console.log('='.repeat(70));

const customChunker = createHybridChunker({
  maxTokens: 512, // Smaller chunks
  overlapTokens: 128, // More overlap
  semanticThreshold: 0.9, // Stricter similarity
  debug: false,
});

const customChunks = customChunker.chunk(typeScriptCode, 'services.ts');

console.log('\nWith custom config (maxTokens: 512):');
console.log(`  Generated ${customChunks.length} chunks`);
console.log(
  `  Avg tokens/chunk: ${(customChunks.reduce((sum, c) => sum + c.tokens, 0) / customChunks.length).toFixed(0)}`
);

const defaultChunks = chunker.chunk(typeScriptCode, 'services.ts');

console.log('\nWith default config (maxTokens: 1024):');
console.log(`  Generated ${defaultChunks.length} chunks`);
console.log(
  `  Avg tokens/chunk: ${(defaultChunks.reduce((sum, c) => sum + c.tokens, 0) / defaultChunks.length).toFixed(0)}`
);

console.log('\n✅ All examples completed successfully!');
console.log('See HYBRID_CHUNKING.md for detailed documentation.\n');
