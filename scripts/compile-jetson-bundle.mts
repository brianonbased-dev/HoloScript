/**
 * Compile jetson-orin-brain.hsplus → EdgeCompiler deployment bundle
 * Usage: pnpm tsx scripts/compile-jetson-bundle.mts
 *
 * Pre-processes the .hsplus brain format's `traits ["..."]` string array
 * (which the HoloCompositionParser skips) by injecting them as HoloObjectTrait
 * objects before passing to EdgeCompiler.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { EdgeCompiler } from '../packages/core/src/compiler/EdgeCompiler';
import { createTestCompilerToken } from '../packages/core/src/compiler/CompilerBase';
import type {
  HoloComposition,
  HoloObjectTrait,
} from '../packages/core/src/parser/HoloCompositionTypes';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'compositions', 'jetson-orin-brain.hsplus');
const OUT_DIR = join(ROOT, '.bench-logs', 'jetson-bundle');

const raw = readFileSync(SRC, 'utf-8');

// Strip the preamble text before #version — the parser expects HoloScript source
const versionOffset = raw.lastIndexOf('\n#version');
if (versionOffset < 0) {
  throw new Error(`Unable to find the HoloScript source marker in ${SRC}`);
}
const hsSource = raw.slice(versionOffset + 1);

// Extract trait names from the brain-format `traits [ "name1", "name2" ]` block.
// HoloCompositionParser handles @DecoratorName style but silently skips the
// string-array block used in .hsplus brain compositions.
function extractBrainTraits(src: string): string[] {
  const match = src.match(/^\s*traits\s*\[([^\]]+)\]/m);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.replace(/['"]/g, '').trim())
    .filter(Boolean);
}

const brainTraitNames = extractBrainTraits(hsSource);

// Inject brain traits as HoloObjectTrait objects so EdgeCompiler.collectTraitNames() sees them
const injected: HoloObjectTrait[] = brainTraitNames.map((name) => ({
  type: 'ObjectTrait' as const,
  name,
  config: {},
  args: [],
}));

const composition: HoloComposition = {
  type: 'Composition',
  name: 'jetson-orin-brain',
  templates: [],
  objects: [],
  spatialGroups: [],
  lights: [],
  imports: [],
  timelines: [],
  audio: [],
  zones: [],
  transitions: [],
  conditionals: [],
  iterators: [],
  npcs: [],
  quests: [],
  abilities: [],
  dialogues: [],
  stateMachines: [],
  achievements: [],
  talentTrees: [],
  shapes: [],
  traits: injected,
};

if (injected.length > 0) {
  console.log(`Injected ${injected.length} brain traits: ${brainTraitNames.join(', ')}`);
}

const compiler = new EdgeCompiler({
  ollamaUrl: 'http://192.168.0.119:11434',
  model: 'qwen3:4b',
  platform: 'linux-arm64',
  remotePath: '/opt/holoscript',
  serviceUser: 'holoscript',
});

const token = createTestCompilerToken();
const json = compiler.compile(composition, token);
const bundle = JSON.parse(json) as {
  name: string;
  target: string;
  config: Record<string, boolean | string>;
  files: Array<{ path: string; content: string }>;
  deployInstructions: string;
};

mkdirSync(OUT_DIR, { recursive: true });

console.log(`\n=== EdgeCompiler bundle: ${bundle.name} ===`);
console.log('Config flags:', bundle.config);
console.log('Files:');

for (const file of bundle.files) {
  const dest = join(OUT_DIR, file.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, file.content, 'utf-8');
  console.log(`  wrote ${file.path} (${file.content.length} chars)`);
}

// Write the full bundle JSON for inspection
writeFileSync(join(OUT_DIR, '_bundle.json'), json, 'utf-8');
console.log('\nDeploy instructions:');
console.log(bundle.deployInstructions);
console.log(`\nBundle written to: ${OUT_DIR}`);
