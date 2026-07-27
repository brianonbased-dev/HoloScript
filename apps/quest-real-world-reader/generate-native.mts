#!/usr/bin/env tsx
/**
 * Materialize HoloRead's Meta Quest project from HoloScript source.
 *
 * reader.holo is parsed through HoloCompositionParser and lowered by QuestCompiler.
 * reader-lifecycle.hsplus is compiled through the HSIIR Kotlin state-machine emitter.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { QuestCompiler } from '../../packages/core/src/compiler/QuestCompiler';
import { compileHSPlusStateMachineToKotlin } from '../../packages/core/src/compiler/HSIIRKotlinStateMachineEmitter';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'reader.holo');
const lifecyclePath = join(here, 'reader-lifecycle.hsplus');
const outputDirectory = join(here, 'android-mr');
const packageDirectory = 'app/src/main/java/net/holoscript/holoread';

export function compileHoloRead(): Record<string, string> {
  const source = readFileSync(sourcePath, 'utf8');
  const parsed = new HoloCompositionParser().parse(source);
  if (!parsed.success || !parsed.ast) {
    throw new Error(`${basename(sourcePath)} parse failed: ${JSON.stringify(parsed.errors)}`);
  }
  const files = new QuestCompiler().compile(parsed.ast, '');
  const lifecycle = compileHSPlusStateMachineToKotlin(readFileSync(lifecyclePath, 'utf8'), {
    machineName: 'ReaderLifecycle',
    className: 'ReaderLifecycleMachine',
    packageName: 'net.holoscript.holoread',
  });
  files[`${packageDirectory}/ReaderLifecycleMachine.kt`] = lifecycle.code;
  return files;
}

export function materializeHoloRead(): number {
  const files = compileHoloRead();
  for (const [relativePath, content] of Object.entries(files)) {
    const outputPath = join(outputDirectory, relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);
    console.log(`  wrote ${relativePath} (${content.length} bytes)`);
  }
  console.log(`generate-native: wrote ${Object.keys(files).length} HoloScript-derived file(s)`);
  return Object.keys(files).length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  materializeHoloRead();
}
