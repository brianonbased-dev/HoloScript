#!/usr/bin/env tsx
/**
 * Fail-closed HoloRead release admission.
 *
 * Every product Kotlin file must be present in fresh compiler output, and every emitted file must
 * byte-match the tracked Android project. Root Gradle/version-catalog files are the bounded platform
 * bridge; they contain no product behavior.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHoloRead } from './generate-native.mts';

const here = dirname(fileURLToPath(import.meta.url));
const androidDirectory = join(here, 'android-mr');
const kotlinDirectory = join(
  androidDirectory,
  'app',
  'src',
  'main',
  'java',
  'net',
  'holoscript',
  'holoread'
);

const normalize = (value: string): string => value.replace(/\r\n/g, '\n');
const emitted = compileHoloRead();
const failures: string[] = [];

for (const [relativePath, expected] of Object.entries(emitted)) {
  let actual: string;
  try {
    actual = readFileSync(join(androidDirectory, relativePath), 'utf8');
  } catch {
    failures.push(`MISSING ${relativePath}`);
    continue;
  }
  if (normalize(actual) !== normalize(expected)) failures.push(`DRIFT ${relativePath}`);
}

const emittedKotlin = new Set(
  Object.keys(emitted)
    .filter((path) => path.endsWith('.kt'))
    .map((path) => path.replace(/\\/g, '/'))
);
for (const entry of readdirSync(kotlinDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.kt')) continue;
  const absolute = join(kotlinDirectory, entry.name);
  const relativePath = relative(androidDirectory, absolute).replace(/\\/g, '/');
  if (!emittedKotlin.has(relativePath)) failures.push(`UNAUTHORED KOTLIN ${relativePath}`);
}

if (failures.length > 0) {
  console.error('HoloRead born-from-source gate failed:');
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `HoloRead born-from-source PASS: ${Object.keys(emitted).length} emitted files byte-match; ` +
      `${emittedKotlin.size} Kotlin files have no alternate native source.`
  );
}
