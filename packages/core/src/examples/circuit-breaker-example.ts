/**
 * Circuit Breaker Usage Examples
 *
 * Demonstrates practical usage patterns for the GraphQL Circuit Breaker
 */

import {
  GraphQLCircuitBreakerClient,
  FallbackDataProvider
} from '../GraphQLCircuitBreakerClient';
import { CircuitBreakerMetrics, MetricsMonitor } from '../CircuitBreakerMetrics';
import { DegradedModeIndicator } from '../DegradedModeBanner';

// ========================================
// Example 1: Basic Setup
// ========================================

export function example1_BasicSetup() {
  const client = new GraphQLCircuitBreakerClient({
    endpoint: 'https://api.example.com/graphql',
    timeout: 10000,
    enableCacheFallback: true,
    maxRetries: 3
  });

  return client;
}

// ========================================
// Example 2: Simple Query Execution
// ========================================

export async function example2_SimpleQuery() {
  const client = example1_BasicSetup();

  const result = await client.query({
    query: `
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
          createdAt
        }
      }
    `,
    variables: { id: '123' },
    operationName: 'GetUser'
  });

  if (result.success) {
    console.log('✓ User retrieved:', result.data);
    if (result.fromCache) {
      console.log('⚠ Served from cache (degraded mode)');
    }
  } else {
    console.error('✗ Query failed:', result.error?.message);
  }

  return result;
}

// ========================================
// Example 3: Register Fallback Data
// ========================================

export function example3_FallbackData() {
  // Register fallback data for common queries
  FallbackDataProvider.register('GetUsers', {
    data: {
      users: [] // Empty array for list queries
    }
  });

  FallbackDataProvider.register('GetDashboard', {
    data: {
      widgets: [],
      metrics: {
        loading: true,
        message: 'Data temporarily unavailable'
      }
    }
  });

  FallbackDataProvider.register('GetNotifications', {
    data: {
      notifications: [],
      unreadCount: 0
    }
  });

  console.log('✓ Fallback data registered for 3 operations');
}

// ========================================
// Example 4: Monitoring Circuit States
// ========================================

export function example4_MonitorCircuits(client: GraphQLCircuitBreakerClient) {
  // Check circuit states every 10 seconds
  setInterval(() => {
    const stats = client.getCircuitStats();

    console.log('\n━━━ Circuit Status ━━━');

    stats.forEach(stat => {
      const stateEmoji = {
        CLOSED: '🟢',
        HALF_OPEN: '🟡',
        OPEN: '🔴'
      }[stat.state];

      console.log(
        `${stateEmoji} ${stat.operationName}:`,
        `${stat.state} (${(stat.failureRate * 100).toFixed(1)}% failure rate,`,
        `${stat.cacheHits} cache hits)`
      );
    });

    // Check system health
    const health = client.getSystemHealth();
    if (health.degradedMode) {
      console.warn('⚠ SYSTEM IN DEGRADED MODE');
      console.warn(`  ${health.circuits.byState.open} circuits open`);
    }
  }, 10000);
}

// ========================================
// Example 5: Metrics Dashboard
// ========================================

export function example5_MetricsDashboard(client: GraphQLCircuitBreakerClient) {
  const monitor = new MetricsMonitor(client, 10000);
  const metrics = monitor.getMetrics();

  // Start automatic metrics capture
  monitor.start();

  // Display dashboard every minute
  setInterval(() => {
    console.clear();
    console.log(metrics.generateDashboard());
  }, 60000);

  // Cleanup function
  return () => monitor.stop();
}

// ========================================
// Example 6: Export Metrics
// ========================================

export function example6_ExportMetrics(client: GraphQLCircuitBreakerClient) {
  const metrics = new CircuitBreakerMetrics(client);

  // Capture current snapshot
  metrics.captureSnapshot();

  // Export as JSON
  const json = metrics.export({ format: 'json', includeHistograms: true });
  console.log('JSON Export:', json);

  // Export as Prometheus
  const prometheus = metrics.export({ format: 'prometheus' });
  console.log('Prometheus Export:\n', prometheus);

  // Export as CSV
  const csv = metrics.export({ format: 'csv' });
  console.log('CSV Export:\n', csv);
}

// ========================================
// Example 7: Handle Degraded Mode in UI
// ========================================

export function example7_DegradedModeUI(client: GraphQLCircuitBreakerClient) {
  // Vanilla JavaScript (non-React)
  const indicator = new DegradedModeIndicator(client, document.body);
  indicator.startMonitoring(5000);

  console.log('✓ Degraded mode indicator active');
}

// ========================================
// Example 8: Multiple Queries with Different Circuits
// ========================================

export async function example8_MultipleQueries() {
  const client = example1_BasicSetup();

  // These will use independent circuit breakers
  const [usersResult, postsResult, commentsResult] = await Promise.all([
    client.query({
      query: 'query GetUsers { users { id name } }',
      operationName: 'GetUsers'
    }),
    client.query({
      query: 'query GetPosts { posts { id title } }',
      operationName: 'GetPosts'
    }),
    client.query({
      query: 'query GetComments { comments { id text } }',
      operationName: 'GetComments'
    })
  ]);

  console.log('Results:');
  console.log('- Users:', usersResult.success ? '✓' : '✗');
  console.log('- Posts:', postsResult.success ? '✓' : '✗');
  console.log('- Comments:', commentsResult.success ? '✓' : '✗');

  // Show which came from cache
  if (usersResult.fromCache) console.log('  (Users from cache)');
  if (postsResult.fromCache) console.log('  (Posts from cache)');
  if (commentsResult.fromCache) console.log('  (Comments from cache)');
}

// ========================================
// Example 9: Custom Configuration per Environment
// ========================================

export function example9_EnvironmentConfig() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';

  const client = new GraphQLCircuitBreakerClient({
    endpoint: process.env.GRAPHQL_ENDPOINT!,

    circuitBreakerConfig: {
      // More lenient in development
      failureRateThreshold: isDevelopment ? 0.8 : 0.5,
      consecutiveTimeoutThreshold: isDevelopment ? 10 : 5,

      // Faster recovery in production (assume better infrastructure)
      openStateTimeout: isProduction ? 15000 : 30000,

      // More aggressive retries in production
      baseRetryDelay: isProduction ? 500 : 1000,
      maxRetryDelay: isProduction ? 15000 : 30000
    }
  });

  console.log(`✓ Client configured for ${process.env.NODE_ENV}`);

  return client;
}

// ========================================
// Example 10: Testing Agent Integration
// ========================================

export async function example10_TestingAgentIntegration() {
  const client = new GraphQLCircuitBreakerClient({
    endpoint: 'https://api.example.com/graphql',
    headers: {
      'X-Agent-ID': process.env.AGENT_ID || 'testing-agent-001',
      'X-Agent-Role': 'testing-agent',
      Authorization: `Bearer ${process.env.AGENT_TOKEN}`
    },
    enableCacheFallback: true,
    maxRetries: 3
  });

  console.log('🤖 Testing Agent Circuit Breaker Initialized');

  // Run health check before tests
  const healthResult = await client.query({
    query: 'query HealthCheck { ping }',
    operationName: 'HealthCheck'
  });

  if (!healthResult.success) {
    console.warn('⚠ Backend unhealthy - tests will use degraded mode');
  }

  // Run test queries
  const testResult = await client.query({
    query: `
      query TestQuery($input: TestInput!) {
        testEndpoint(input: $input) {
          success
          data
        }
      }
    `,
    variables: { input: { testId: 'test-123' } },
    operationName: 'TestQuery'
  });

  // Log metrics for test report
  const stats = client.getCircuitStats();
  console.log('\n📊 Test Execution Metrics:');
  stats.forEach(stat => {
    console.log(`  ${stat.operationName}:`);
    console.log(`    State: ${stat.state}`);
    console.log(`    Requests: ${stat.totalRequests}`);
    console.log(`    Failure Rate: ${(stat.failureRate * 100).toFixed(2)}%`);
    console.log(`    Cache Hits: ${stat.cacheHits}`);
  });

  return { healthResult, testResult, stats };
}

// ========================================
// Example 11: Error Recovery Scenario
// ========================================

export async function example11_ErrorRecoveryScenario() {
  const client = new GraphQLCircuitBreakerClient({
    endpoint: 'https://api.example.com/graphql',
    enableCacheFallback: true,
    circuitBreakerConfig: {
      openStateTimeout: 5000, // Quick recovery for demo
      healthCheckCount: 3,
      successThreshold: 2
    }
  });

  console.log('📋 Simulating error recovery scenario...\n');

  // Step 1: Initial successful query
  console.log('Step 1: Execute successful query');
  await client.query({
    query: 'query GetData { data { id } }',
    operationName: 'GetData'
  });

  let stats = client.getCircuitStats();
  console.log(`  Circuit state: ${stats[0]?.state}\n`);

  // Step 2: Simulate failures (would need to mock in real scenario)
  console.log('Step 2: Failures occur (circuit opens)');
  console.log('  [Simulated - circuit would open after threshold]\n');

  // Step 3: Wait for half-open
  console.log('Step 3: Wait for automatic recovery attempt');
  console.log('  [Waiting 5 seconds...]\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 4: Health checks pass (circuit closes)
  console.log('Step 4: Health checks pass (circuit closes)');
  console.log('  [Would execute health check queries]\n');

  // Step 5: Normal operation resumed
  console.log('Step 5: Normal operation resumed');
  stats = client.getCircuitStats();
  console.log(`  Final circuit state: ${stats[0]?.state || 'CLOSED'}`);
}

// ========================================
// Example 12: Real-time Metrics Stream
// ========================================

export function example12_RealTimeMetrics(client: GraphQLCircuitBreakerClient) {
  const metrics = new CircuitBreakerMetrics(client);

  // Capture snapshots every 5 seconds
  setInterval(() => {
    const snapshot = metrics.captureSnapshot();

    console.log(`\n⏱️  ${snapshot.timestamp.toISOString()}`);
    console.log(`Health Score: ${snapshot.health.score}/100 (${snapshot.health.status})`);
    console.log(`Open Circuits: ${snapshot.aggregate.circuitsByState.open}`);
    console.log(`Overall Failure Rate: ${(snapshot.aggregate.overallFailureRate * 100).toFixed(2)}%`);
    console.log(`Cache Hits: ${snapshot.aggregate.totalCacheHits}`);
  }, 5000);
}

// ========================================
// Example 13: Manual Circuit Management
// ========================================

export function example13_ManualCircuitManagement(client: GraphQLCircuitBreakerClient) {
  // Reset specific circuit
  console.log('Resetting GetUser circuit...');
  client.resetCircuit('GetUser');

  // Reset all circuits
  console.log('Resetting all circuits...');
  client.resetAllCircuits();

  // Verify reset
  const stats = client.getCircuitStats();
  console.log('All circuits reset:', stats.every(s => s.totalRequests === 0));
}

// ========================================
// Main Demo Function
// ========================================

export async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     GraphQL Circuit Breaker - Usage Examples                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Setup
  console.log('━━━ Setup ━━━');
  const client = example1_BasicSetup();
  example3_FallbackData();

  // Execute queries
  console.log('\n━━━ Query Execution ━━━');
  await example2_SimpleQuery();
  await example8_MultipleQueries();

  // Monitoring
  console.log('\n━━━ Monitoring ━━━');
  const stopMonitoring = example5_MetricsDashboard(client);

  // Wait a bit to collect metrics
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Export metrics
  console.log('\n━━━ Metrics Export ━━━');
  example6_ExportMetrics(client);

  // Cleanup
  stopMonitoring();

  console.log('\n✓ All examples completed!');
}

// Run if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
