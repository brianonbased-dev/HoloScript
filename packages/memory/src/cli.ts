#!/usr/bin/env node

import {
  resolveSovereignMemoryConfigFromEnv,
  runSovereignMemoryRoundTrip,
} from './consumer-runtime.js';
import { SovereignMemoryStore } from './sovereign-memory-store.js';

const command = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? 'help';

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeHelp(): void {
  process.stdout.write(
    [
      'HoloScript Sovereign Memory',
      '',
      'Usage: holoscript-memory <doctor|init|roundtrip> [--json]',
      '',
      'Commands:',
      '  doctor     Check connection and schema readiness without changing data',
      '  init       Explicitly create or upgrade the public memory schema',
      '  roundtrip  Bootstrap, store, recall, clean up, and emit a JSON receipt',
      '',
      'Configuration:',
      '  MEMORY_DATABASE_URL, DATABASE_URL, or HOLOREPO_DATABASE_URL',
      '  or MEMORY_PGHOST, MEMORY_PGPORT, MEMORY_PGDATABASE, MEMORY_PGUSER, MEMORY_PGPASSWORD',
      '  MEMORY_WORKSPACE optionally scopes all reads and writes',
      '',
      'Credentials are read from the environment and never printed.',
      '',
    ].join('\n')
  );
}

async function main(): Promise<number> {
  if (command === 'help') {
    writeHelp();
    return 0;
  }
  if (!['doctor', 'init', 'roundtrip'].includes(command)) {
    writeHelp();
    return 2;
  }

  const resolved = resolveSovereignMemoryConfigFromEnv();
  if (!resolved.status.configured) {
    writeJson({
      schema: 'holoscript.memory.cli.v1',
      generatedAt: new Date().toISOString(),
      command,
      ok: false,
      config: resolved.status,
      error: {
        code: 'memory-database-not-configured',
        message:
          'Inject MEMORY_DATABASE_URL or MEMORY_PGHOST through the caller-owned environment.',
      },
    });
    return 1;
  }

  const store = new SovereignMemoryStore(resolved.config);
  try {
    if (command === 'doctor') {
      const health = await store.health();
      writeJson({
        schema: 'holoscript.memory.cli.v1',
        generatedAt: new Date().toISOString(),
        command,
        ok: health.ok,
        config: resolved.status,
        health,
      });
      return health.ok ? 0 : 1;
    }
    if (command === 'init') {
      const schemaReceipt = await store.ensureSchema();
      writeJson({
        schema: 'holoscript.memory.cli.v1',
        generatedAt: new Date().toISOString(),
        command,
        ok: schemaReceipt.ok,
        config: resolved.status,
        schemaReceipt,
      });
      return schemaReceipt.ok ? 0 : 1;
    }

    const receipt = await runSovereignMemoryRoundTrip({
      store,
      workspaceId: resolved.status.workspaceId,
    });
    writeJson({ ...receipt, config: resolved.status });
    return receipt.ok ? 0 : 1;
  } finally {
    await store.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    writeJson({
      schema: 'holoscript.memory.cli.v1',
      generatedAt: new Date().toISOString(),
      command,
      ok: false,
      error: {
        code: 'memory-command-failed',
        message: message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[REDACTED_POSTGRES_URL]'),
      },
    });
    process.exitCode = 1;
  });
