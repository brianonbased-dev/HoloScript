#!/usr/bin/env node
/**
 * studio-typecheck.mjs — strict TypeScript check for packages/studio, decoupled
 * from the Docker build (which keeps typescript.ignoreBuildErrors: true so it
 * never blocks production deploys).
 *
 * WHY DECOUPLED: Next.js bails out of tsc on the first complex import-graph error
 * during `next build` — a single transitive type problem can fail the whole build.
 * The production image build therefore uses ignoreBuildErrors: true. This script
 * runs the SAME check that `next build` would run (tsc --noEmit) but fails loud
 * in CI rather than the deploy pipeline.
 *
 * Exit 0 iff `tsc --noEmit -p packages/studio/tsconfig.json` passes cleanly.
 * Exit 1 on type errors.
 * Exit 2 on setup failure (missing tsconfig, tsc not found).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(
  process.env.HOLO_ROOT || process.cwd()
);
const TSCONFIG = path.join(ROOT, 'packages', 'studio', 'tsconfig.json');
const TAG = '[studio-typecheck]';

if (!fs.existsSync(TSCONFIG)) {
  console.error(`${TAG} FAIL: tsconfig not found at ${TSCONFIG}`);
  process.exit(2);
}

console.log(`\n${TAG} tsc --noEmit -p packages/studio/tsconfig.json`);

try {
  const result = execSync(
    `npx tsc --noEmit -p "${TSCONFIG}"`,
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 }
  );
  if (result && result.trim()) {
    process.stdout.write(result);
  }
  console.log(`${TAG} OK — no type errors`);
  process.exit(0);
} catch (e) {
  const out = (String(e.stdout || '') + String(e.stderr || '')).trim();
  if (out) process.stdout.write(out + '\n');
  const errorLines = (out.match(/error TS\d+/g) || []).length;
  console.error(`${TAG} FAIL — ${errorLines} type error(s) found`);
  process.exit(1);
}
