#!/usr/bin/env node
'use strict';

const optionMap = new Map([
  ['--size', 'MCP_SERVER_SIZE'],
  ['--port', 'PORT'],
  ['--max-body-bytes', 'MCP_REQUEST_BODY_MAX_BYTES'],
  ['--pg-pool-max', 'MCP_POSTGRES_POOL_MAX'],
  ['--oauth-rate-limit', 'OAUTH_RATE_LIMIT'],
  ['--public-anon-rate-limit', 'PUBLIC_ANON_RATE_LIMIT'],
  ['--consumer-gen-rate-limit', 'HOLOSCRIPT_CONSUMER_GEN_RATE_LIMIT'],
  ['--consumer-gen-daily-quota', 'HOLOSCRIPT_CONSUMER_GEN_DAILY_QUOTA'],
  ['--max-concurrent-tools', 'MCP_MAX_CONCURRENT_TOOL_CALLS'],
  ['--tool-timeout-ms', 'MCP_TOOL_TIMEOUT_MS'],
  ['--cache-max-entries', 'MCP_CACHE_MAX_ENTRIES'],
  ['--memory-budget-mb', 'MCP_MEMORY_BUDGET_MB'],
]);

function printHelp() {
  process.stdout.write(`HoloScript MCP HTTP server

Usage:
  holoscript-mcp-http [options]

Options:
  --size <tiny|small|standard|large|xlarge|laptop|jetson|vast|fleet>
  --port <number>
  --max-body-bytes <bytes>
  --pg-pool-max <connections>
  --oauth-rate-limit <requests-per-minute>
  --public-anon-rate-limit <requests-per-minute>
  --consumer-gen-rate-limit <requests-per-minute>
  --consumer-gen-daily-quota <generations-per-day>
  --max-concurrent-tools <count>
  --tool-timeout-ms <milliseconds>
  --cache-max-entries <entries>
  --memory-budget-mb <megabytes>
  --enable-sse
  --help
`);
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  if (arg === '--enable-sse') {
    process.env.MCP_ENABLE_SSE = 'true';
    continue;
  }
  const envName = optionMap.get(arg);
  if (!envName) {
    process.stderr.write(`Unknown option: ${arg}\n\n`);
    printHelp();
    process.exit(1);
  }
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    process.stderr.write(`Missing value for ${arg}\n\n`);
    printHelp();
    process.exit(1);
  }
  process.env[envName] = value;
  i += 1;
}

require('../dist/http-server.js');
