/* global process */
/**
 * Provider-call fence for a CHILD PROCESS.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * The in-process fence covers `globalThis.fetch` in the process that installed
 * it. A child process has its own globals, so a `fetch` in a child was outside
 * every fence on this lane — and the lane spawns children on the executed path,
 * including the HoloScript CLI's `parse` and `headless` runs, which are the
 * component that would actually reach a provider. "The checker made zero
 * provider calls" was therefore a claim about the parent only, while the real
 * execution path ran unmeasured. That is the same defect this lane has been
 * closing everywhere else: a zero over a window nobody was watching.
 *
 * This module is loaded into the child by `--import` (via NODE_OPTIONS, so it
 * reaches grandchildren too), installs the SAME fence there, and writes the
 * child's own observation into a directory the parent gave it. The parent then
 * verifies that observation with the same `verifyProviderCallObservation` rule
 * set it applies to its own, and folds it into the receipt.
 *
 * ---------------------------------------------------------------------------
 * ABSENT EVIDENCE MUST BLOCK — INCLUDING A CHILD THAT DIED
 * ---------------------------------------------------------------------------
 * An UNMEASURED placeholder is written the moment this module loads, BEFORE the
 * child does any work. It is overwritten with the real observation on a clean
 * exit. So a child that is killed, crashes, or never reaches its exit hook
 * leaves a record that says UNMEASURED and FAILS the parent's gate — it never
 * leaves nothing, and "nothing" is separately treated as UNMEASURED by the
 * parent. A child that quietly reported 0 because it was never watched is
 * exactly what this arrangement removes.
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  PROVIDER_FENCE_CHILD_DIR_ENV,
  PROVIDER_FENCE_CHILD_WINDOW_ENV,
  installProviderCallFence,
  summarizeProviderCallFence,
  unmeasuredProviderCallObservation,
} from './model-village-provider-call-fence.mjs';

function writeObservation(file, observation) {
  try {
    writeFileSync(file, `${JSON.stringify(observation, null, 2)}\n`, 'utf8');
  } catch {
    // A child that cannot write its observation leaves the placeholder, or
    // leaves nothing — both are UNMEASURED to the parent, never a zero.
  }
}

const outputDir = process.env[PROVIDER_FENCE_CHILD_DIR_ENV];

if (outputDir) {
  const window =
    `${process.env[PROVIDER_FENCE_CHILD_WINDOW_ENV] || 'child-process'}`
    + `#pid${process.pid}`;
  let file = null;
  try {
    mkdirSync(outputDir, { recursive: true });
    file = path.join(
      outputDir,
      `provider-fence-${process.pid}-${randomUUID()}.json`,
    );
    writeObservation(
      file,
      unmeasuredProviderCallObservation(
        window,
        'the child process did not reach its exit hook, so its provider-call '
        + 'window was never published',
      ),
    );
  } catch {
    file = null;
  }

  if (file) {
    const fence = installProviderCallFence();
    process.on('exit', () => {
      writeObservation(
        file,
        summarizeProviderCallFence(fence, { window }),
      );
    });
  }
}
