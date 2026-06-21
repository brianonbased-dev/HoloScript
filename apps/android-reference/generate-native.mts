#!/usr/bin/env tsx
/**
 * Native generator for the legacy plain-Android (ARCore) reference app.
 *
 * Parses scene.holo through the REAL HoloCompositionParser and compiles it through the in-core
 * AndroidCompiler via compileToFiles(), writing the @generated files into android/. Mirrors the
 * Android-XR generate-native.mts pattern so "edit the spec, not the Kotlin" is enforceable by the
 * golden-diff gate. Run: npx tsx apps/android-reference/generate-native.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { AndroidCompiler } from '../../packages/core/src/compiler/AndroidCompiler';
import { ANDROID_PACKAGE, ANDROID_CLASS } from './compile-config.mts';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, 'scene.holo');
const refDir = join(here, 'android');

function parse(file: string) {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`${basename(file)} parse failed:`, r.errors);
    process.exit(1);
  }
  return r.ast;
}

const compiler = new AndroidCompiler({
  packageName: ANDROID_PACKAGE,
  className: ANDROID_CLASS,
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

console.log(`generate-native: wrote ${n} @generated file(s) into android/`);
