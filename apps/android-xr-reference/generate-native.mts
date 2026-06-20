#!/usr/bin/env tsx
/**
 * Native generator for the Android XR reference app.
 *
 * Parses scene.holo through the REAL HoloCompositionParser and compiles it through the in-core
 * AndroidXRCompiler (headset form factor) via compileToFiles(), writing the @generated files into
 * android-xr/. Mirrors the Quest generate-native.mts pattern so "edit the spec, not the Kotlin"
 * is enforceable by the golden-diff gate. Run: npx tsx apps/android-xr-reference/generate-native.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { AndroidXRCompiler } from '../../packages/core/src/compiler/AndroidXRCompiler';
import { ANDROID_XR_PACKAGE, ANDROID_XR_ACTIVITY } from './compile-config.mts';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, 'scene.holo');
const refDir = join(here, 'android-xr');

function parse(file: string) {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`${basename(file)} parse failed:`, r.errors);
    process.exit(1);
  }
  return r.ast;
}

const compiler = new AndroidXRCompiler({
  packageName: ANDROID_XR_PACKAGE,
  activityName: ANDROID_XR_ACTIVITY,
});
const files = compiler.compileToFiles(parse(specPath), '');

let n = 0;
for (const [rel, content] of Object.entries(files)) {
  const out = join(refDir, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content as string);
  console.log(`  wrote ${rel} (${(content as string).length} bytes)`);
  n++;
}

console.log(`generate-native: wrote ${n} @generated file(s) into android-xr/`);
