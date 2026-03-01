#!/usr/bin/env tsx
/**
 * Brittney v3.0 Dataset Generator
 * Works directly from canonical HoloScript repository
 * Generates ~240,000 examples with v3.0 syntax
 */

import { writeFile } from 'fs/promises';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

interface TrainingExample {
  instruction: string;
  input: string;
  output: string;
}

const START_TIME = Date.now();
const allExamples: TrainingExample[] = [];

console.log('='.repeat(80));
console.log('🚀 Brittney v3.0 - Dataset Generation from Canonical HoloScript');
console.log('='.repeat(80));
console.log();

// ============================================================================
// DISCOVER ALL TRAITS FROM REPO
// ============================================================================

const TRAITS_DIR = path.join(__dirname, '../packages/core/src/traits');
const traitFiles = readdirSync(TRAITS_DIR).filter(f => f.endsWith('Trait.ts'));
const traitNames = traitFiles.map(f => f.replace('Trait.ts', '').toLowerCase().replace(/([A-Z])/g, '_$1').replace(/^_/, ''));

console.log(`[DISCOVERY] Found ${traitNames.length} traits in ${TRAITS_DIR}`);
console.log(`First 10: ${traitNames.slice(0, 10).join(', ')}`);
console.log();

// ============================================================================
// CONSTANTS
// ============================================================================

const GEOMETRIES = [
  'box', 'sphere', 'cylinder', 'plane', 'torus', 'cone', 'capsule',
  'heart', 'crystal', 'gear', 'lightning', 'diamond', 'star'
];

const MATERIALS = [
  'standard', 'pbr', 'physical', 'glass', 'emissive', 'metallic',
  'chrome', 'gold', 'hologram', 'neon'
];

const COLORS = [
  '"#ff0000"', '"#00ff00"', '"#0000ff"', '"#ff6600"', '"#3498db"'
];

const ANIMATIONS = [
  'spin', 'float', 'bounce', 'pulse', 'breathe', 'glow'
];

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// EXAMPLE GENERATION
// ============================================================================

function generateTraitExample(traitName: string, difficulty: string): TrainingExample {
  const geometry = random(GEOMETRIES);
  const material = random(MATERIALS);
  const color = random(COLORS);
  const animation = Math.random() > 0.5 ? random(ANIMATIONS) : null;

  const x = (Math.random() * 10 - 5).toFixed(1);
  const y = (Math.random() * 3).toFixed(1);
  const z = (Math.random() * 10 - 5).toFixed(1);

  const scale = (Math.random() * 2 + 0.5).toFixed(1);

  const objectName = `${traitName}_${Math.floor(Math.random() * 1000)}`;
  const sceneName = `Scene_${Math.floor(Math.random() * 100)}`;

  let code = `composition "${sceneName}" {\n`;
  code += `  object "${objectName}" {\n`;
  code += `    @${traitName}\n`;
  code += `\n`;
  code += `    geometry: "${geometry}"\n`;
  code += `    material: "${material}"\n`;
  code += `    color: ${color}\n`;
  code += `    position: [${x}, ${y}, ${z}]\n`;
  code += `    scale: ${scale}\n`;

  if (animation) {
    code += `\n`;
    code += `    animate: "${animation}"\n`;
    code += `    animSpeed: ${(Math.random() * 2 + 0.5).toFixed(2)}\n`;
  }

  code += `  }\n`;
  code += `}`;

  return {
    instruction: `Create a HoloScript object with @${traitName} trait`,
    input: '',
    output: code
  };
}

// ============================================================================
// PHASE 1: ALL TRAITS (200K+ examples)
// ============================================================================

console.log('[PHASE 1] Generating trait examples...');
console.log(`  Traits: ${traitNames.length}`);
console.log(`  Examples per trait: 1,200 (300 × 4 difficulty levels)`);
console.log();

const difficulties = ['beginner', 'intermediate', 'advanced', 'expert'];

for (let i = 0; i < traitNames.length; i++) {
  const traitName = traitNames[i];

  for (const difficulty of difficulties) {
    for (let j = 0; j < 300; j++) {
      allExamples.push(generateTraitExample(traitName, difficulty));
    }
  }

  if ((i + 1) % 20 === 0) {
    const elapsed = ((Date.now() - START_TIME) / 1000 / 60).toFixed(1);
    console.log(`  Progress: ${i + 1}/${traitNames.length} traits | ${allExamples.length.toLocaleString()} examples | ${elapsed}min`);
  }
}

console.log(`  Phase 1 complete: ${allExamples.length.toLocaleString()} examples`);
console.log();

// ============================================================================
// PHASE 2: MODULE SYSTEM (5K examples)
// ============================================================================

console.log('[PHASE 2] Generating module system examples...');

for (let i = 0; i < 5000; i++) {
  const trait1 = random(traitNames);
  const trait2 = random(traitNames);

  allExamples.push({
    instruction: `Create a HoloScript file that imports @${trait1} from a module`,
    input: '',
    output: `@import "./traits.hs" { @${trait1} }\n\ncomposition "ImportExample" {\n  object "Entity" {\n    @${trait1}\n\n    geometry: "${random(GEOMETRIES)}"\n    position: [0, 1, 0]\n  }\n}`
  });
}

console.log(`  Phase 2 complete: 5,000 examples`);
console.log();

// ============================================================================
// PHASE 3: TRAIT COMPOSITION (10K examples)
// ============================================================================

console.log('[PHASE 3] Generating trait composition examples...');

for (let i = 0; i < 10000; i++) {
  const trait1 = random(traitNames);
  const trait2 = random(traitNames);
  const composedName = `${trait1}_${trait2}`;

  allExamples.push({
    instruction: `Create a composed HoloScript trait @${composedName}`,
    input: '',
    output: `@${composedName} = @${trait1} + @${trait2}\n\ncomposition "ComposedExample" {\n  object "Entity" {\n    @${composedName}\n\n    geometry: "${random(GEOMETRIES)}"\n    position: [0, 1, 0]\n  }\n}`
  });
}

console.log(`  Phase 3 complete: 10,000 examples`);
console.log();

// ============================================================================
// PHASE 4: ASYNC/AWAIT (3K examples)
// ============================================================================

console.log('[PHASE 4] Generating async/await examples...');

for (let i = 0; i < 3000; i++) {
  allExamples.push({
    instruction: 'Create a HoloScript object with async handler',
    input: '',
    output: `composition "AsyncExample" {\n  object "Loader" {\n    @networked\n\n    geometry: "box"\n    position: [0, 1, 0]\n\n    async on_init: {\n      const data = await fetch("/api/data")\n      this.content = await data.json()\n    }\n  }\n}`
  });
}

console.log(`  Phase 4 complete: 3,000 examples`);
console.log();

// ============================================================================
// WRITE TO FILE
// ============================================================================

// ============================================================================
// MAIN ASYNC FUNCTION
// ============================================================================

async function writeDataset() {
  console.log('[EXPORT] Writing JSONL file...');

  const outputFile = path.join(__dirname, '../datasets/brittney-v3.0-complete.jsonl');
  const jsonlLines = allExamples.map(ex => JSON.stringify(ex));

  await writeFile(outputFile, jsonlLines.join('\n') + '\n', 'utf-8');

  const sizeMB = (Buffer.byteLength(jsonlLines.join('\n'), 'utf-8') / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - START_TIME) / 1000 / 60).toFixed(1);

  console.log();
  console.log('='.repeat(80));
  console.log('✅ GENERATION COMPLETE');
  console.log('='.repeat(80));
  console.log(`  Total examples: ${allExamples.length.toLocaleString()}`);
  console.log(`  File: ${outputFile}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Time: ${elapsed} minutes`);
  console.log(`  Speed: ${(allExamples.length / parseFloat(elapsed)).toFixed(0)} examples/min`);
  console.log();
  console.log('Next: Upload to Vast.ai and train Brittney v3.0');
  console.log('  Estimated cost: ~$10 (8-10 hours)');
  console.log();
}

writeDataset().catch(console.error);
