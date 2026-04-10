/**
 * Merge All Datasets for Brittney v3.0
 *
 * Merges existing datasets:
 * - HoloScript v3.0: brittney-v3.0-1M.jsonl (850K)
 * - uAA2++ Protocol: uaa2-protocol.jsonl (21K existing)
 * - Knowledge Compression: uaa2-knowledge-compression.jsonl (20K existing)
 * - Physics Domain: physics-domain-knowledge.jsonl (50K - will generate if missing)
 * - Anatomy/Biology: anatomy-biology-knowledge.jsonl (50K - will generate if missing)
 * - Chemistry/Materials: chemistry-materials-knowledge.jsonl (50K - will generate if missing)
 */

import { readFile, writeFile, access } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const START_TIME = Date.now();

console.log('='.repeat(80));
console.log('🚀 BRITTNEY V3.0 - DATASET MERGER');
console.log('='.repeat(80));
console.log();

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateIfMissing(scriptName: string, outputFile: string, description: string) {
  const exists = await fileExists(outputFile);

  if (exists) {
    console.log(`  ✓ ${description} already exists, skipping generation`);
    return;
  }

  console.log(`  ⚙️  Generating ${description}...`);

  try {
    const { stdout } = await execAsync(`npx tsx "${scriptName}"`, {
      maxBuffer: 1024 * 1024 * 100
    });
    console.log(stdout);
    console.log(`  ✓ ${description} generated successfully`);
  } catch (error: any) {
    console.error(`  ✗ Error generating ${description}:`, error.message);
    throw error;
  }
}

async function mergeDatasets() {
  const scriptsDir = __dirname;
  const datasetsDir = path.join(__dirname, '../datasets');

  // ============================================================================
  // PHASE 1: Generate missing domain knowledge datasets
  // ============================================================================

  console.log('='.repeat(80));
  console.log('PHASE 1: CHECKING/GENERATING DOMAIN KNOWLEDGE DATASETS');
  console.log('='.repeat(80));
  console.log();

  await generateIfMissing(
    path.join(scriptsDir, 'generate-physics-knowledge.ts'),
    path.join(datasetsDir, 'physics-domain-knowledge.jsonl'),
    'Physics Domain Knowledge (50K)'
  );

  await generateIfMissing(
    path.join(scriptsDir, 'generate-anatomy-biology-knowledge.ts'),
    path.join(datasetsDir, 'anatomy-biology-knowledge.jsonl'),
    'Anatomy/Biology Knowledge (50K)'
  );

  await generateIfMissing(
    path.join(scriptsDir, 'generate-chemistry-materials-knowledge.ts'),
    path.join(datasetsDir, 'chemistry-materials-knowledge.jsonl'),
    'Chemistry/Materials Knowledge (50K)'
  );

  console.log();

  // ============================================================================
  // PHASE 2: Merge all datasets
  // ============================================================================

  console.log('='.repeat(80));
  console.log('PHASE 2: MERGING ALL DATASETS');
  console.log('='.repeat(80));
  console.log();

  const datasetFiles = [
    { name: 'HoloScript v3.0', file: 'brittney-v3.0-1M.jsonl' },
    { name: 'uAA2++ Protocol', file: 'uaa2-protocol.jsonl' },
    { name: 'Knowledge Compression', file: 'uaa2-knowledge-compression.jsonl' },
    { name: 'Physics', file: 'physics-domain-knowledge.jsonl' },
    { name: 'Anatomy/Biology', file: 'anatomy-biology-knowledge.jsonl' },
    { name: 'Chemistry/Materials', file: 'chemistry-materials-knowledge.jsonl' },
  ];

  let allLines: string[] = [];
  let totalExamples = 0;
  const breakdown: Record<string, number> = {};

  for (const dataset of datasetFiles) {
    const filePath = path.join(datasetsDir, dataset.file);

    try {
      console.log(`Reading ${dataset.name}...`);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);

      console.log(`  ✓ ${lines.length.toLocaleString()} examples`);

      breakdown[dataset.name] = lines.length;
      allLines = allLines.concat(lines);
      totalExamples += lines.length;
    } catch (error: any) {
      console.error(`  ✗ Error reading ${dataset.name}:`, error.message);
      console.error(`  File: ${filePath}`);
      throw error;
    }
  }

  console.log();
  console.log(`Total examples before shuffle: ${totalExamples.toLocaleString()}`);
  console.log();

  // Shuffle for better training distribution
  console.log('Shuffling examples...');
  for (let i = allLines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allLines[i], allLines[j]] = [allLines[j], allLines[i]];
  }
  console.log('  ✓ Shuffle complete');
  console.log();

  // Write final merged dataset
  const finalFile = path.join(datasetsDir, 'brittney-v3.0-complete-FINAL.jsonl');
  const finalContent = allLines.join('\n') + '\n';

  console.log('Writing final dataset...');
  await writeFile(finalFile, finalContent, 'utf-8');

  const sizeMB = (Buffer.byteLength(finalContent, 'utf-8') / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - START_TIME) / 1000 / 60).toFixed(1);

  console.log();
  console.log('='.repeat(80));
  console.log('✅ BRITTNEY V3.0 FINAL DATASET COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('Final Dataset Statistics:');
  console.log(`  Total examples: ${totalExamples.toLocaleString()}`);
  console.log(`  File: ${finalFile}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Generation time: ${elapsed} minutes`);
  console.log();
  console.log('Dataset Breakdown:');

  for (const [name, count] of Object.entries(breakdown)) {
    const percentage = ((count / totalExamples) * 100).toFixed(1);
    console.log(`  ${name.padEnd(25)} ${count.toLocaleString().padStart(10)} (${percentage}%)`);
  }

  console.log(`  ${'─'.repeat(25)} ${'─'.repeat(10)} ${'─'.repeat(7)}`);
  console.log(`  ${'TOTAL'.padEnd(25)} ${totalExamples.toLocaleString().padStart(10)} (100%)`);
  console.log();
  console.log('Next Steps:');
  console.log('  1. Upload to Vast.ai: scp brittney-v3.0-complete-FINAL.jsonl root@<vast-ip>:/workspace/datasets/');
  console.log('  2. Train Brittney v3.0 (~10-12 hours on RTX 6000 Ada)');
  console.log('  3. Estimated cost: ~$12');
  console.log();
}

mergeDatasets().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
