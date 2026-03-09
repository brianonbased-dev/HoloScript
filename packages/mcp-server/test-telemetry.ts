import { handleMonitoringTool } from './src/monitoring-tools';
import { HoloScriptRuntime } from '@holoscript/core';

async function runTelemetryE2E() {
  console.log('=== Phase 7: Performance Monitoring Telemetry E2E Test ===\n');

  const runtime = new HoloScriptRuntime();

  console.log('➜ 1. Executing 100 simulated HoloScript instructions to generate latency data.');
  const statements: any[] = Array.from({ length: 100 }).map((_, i) => ({
    type: 'Assignment',
    target: `var_${i}`,
    operator: '=',
    value: { type: 'Literal', value: i },
  }));

  await runtime.executeHoloProgram(statements);

  console.log('✔ Simulated node execution complete.');

  console.log('\n➜ 2. Requesting metrics snapshot via MCP monitoring tool.');
  const mcpResponse = await handleMonitoringTool('get_telemetry_metrics', {});

  if (!mcpResponse || mcpResponse.status !== 'success') {
    console.error('✖ Failed to fetch telemetry from MCP endpoint.');
    process.exit(1);
  }

  const { counters, histograms, gauges } = mcpResponse.metrics;

  // Assertions
  console.log('\n➜ 3. Validating Exporter Aggregations');

  if (counters['statements_executed{{"type":"Assignment"}}'] === 100) {
    console.log("✔ Counter 'statements_executed' correctly matched 100.");
  } else {
    console.error('✖ Counter match failed!', counters);
    process.exit(1);
  }

  if (
    histograms['execute_stmt_Assignment'] &&
    histograms['execute_stmt_Assignment'].count === 100
  ) {
    console.log(`✔ Histogram 'execute_stmt_Assignment' recorded 100 latency events.`);
    console.log(`   - Average Latency: ${histograms['execute_stmt_Assignment'].avg.toFixed(4)}ms`);
    console.log(`   - Max Latency: ${histograms['execute_stmt_Assignment'].max.toFixed(4)}ms`);
  } else {
    console.error('✖ Histogram match failed!', histograms);
    process.exit(1);
  }

  console.log('\n=== E2E Telemetry Suite Passed! ===');
}

runTelemetryE2E().catch(console.error);
