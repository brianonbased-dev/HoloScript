#!/usr/bin/env node
/**
 * Retired external-provider peer chat workflow.
 *
 * HoloShell now routes agent work through sovereign room receipts and guarded
 * local workflows. This shim remains only so stale invocations fail closed with
 * a receipt-shaped blocker instead of appearing to stage a provider session.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCHEMA_VERSION = 'hololand.holoshell.retired-provider-workflow.v0.1.0';

function receipt() {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workflowId: `retired-${Date.now().toString(36)}`,
    title: 'Retired Provider Chat Workflow',
    sourceAnchors: {
      replacement: 'scripts/holoshell-sovereign-room-marathon.mjs',
    },
    summary: {
      status: 'retired',
      replacementRoute: '/workflow/sovereign-room-marathon',
      mutationExecuted: false,
      executionAllowed: false,
      nextAction: 'Use the sovereign room marathon receipt workflow.',
    },
  };
}

const output = receipt();
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  if (process.argv.includes('--json') || process.argv.includes('--self-test')) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`${output.title} retired. Replacement: ${output.summary.replacementRoute}`);
  }
  process.exit(process.argv.includes('--self-test') && output.summary.status !== 'retired' ? 1 : 0);
}

export { receipt };
