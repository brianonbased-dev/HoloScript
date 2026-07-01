#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifySimulationEvidencePackJson } from '../packages/engine/src/simulation/SimulationEvidencePack';

const [packPath] = process.argv.slice(2);

if (!packPath || packPath === '--help' || packPath === '-h') {
  console.error('Usage: pnpm run simulation:verify <pack.json>');
  process.exit(packPath ? 0 : 2);
}

const absolutePath = resolve(packPath);
const result = verifySimulationEvidencePackJson(readFileSync(absolutePath, 'utf8'));

if (!result.valid) {
  console.error(
    JSON.stringify(
      {
        status: 'fail',
        pack: absolutePath,
        errors: result.errors,
        warnings: result.warnings,
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'pass',
      pack: absolutePath,
      warnings: result.warnings,
      verificationResult: result.verificationResult,
    },
    null,
    2
  )
);
