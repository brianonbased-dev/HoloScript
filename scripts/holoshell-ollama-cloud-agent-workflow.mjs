#!/usr/bin/env node
/**
 * Retired managed-provider agent launcher.
 *
 * HoloShell now consumes local/sovereign room tasks first. Cloud-tagged work
 * remains visible only through explicit escalation receipts, never through this
 * legacy launcher.
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
    title: 'Retired Managed Provider Agent Launcher',
    sourceAnchors: {
      replacement: 'scripts/holoshell-sovereign-room-marathon.mjs',
    },
    summary: {
      status: 'retired',
      replacementRoute: '/workflow/sovereign-room-marathon',
      cloudEscalationRequiresReceipt: true,
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
