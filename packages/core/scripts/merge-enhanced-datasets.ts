import fs from 'fs';
import path from 'path';

const AI_WORKSPACE =
  process.env.AI_WORKSPACE_PATH ||
  path.join(require('os').homedir(), 'Documents', 'GitHub', 'AI_Workspace');
const ARCHIVE_DIR = path.join(AI_WORKSPACE, 'Brittney', 'cloud-training', 'archive');
const OUTPUT_FILE = path.join(
  AI_WORKSPACE,
  'Brittney',
  'training',
  'brittney-reasoning-enhanced.jsonl'
);

// Files to merge (enhanced-* pattern)
const ENHANCED_FILES = [
  'enhanced-holo-visual-thinking.jsonl',
  'enhanced-holo-graph-analysis.jsonl',
  'enhanced-holo-natural-conversation.jsonl',
  'enhanced-holo-vs-hsplus.jsonl',
  'enhanced-hsplus-brittney-training.jsonl',
  'enhanced-phase1-holoscript-training.jsonl',
  'enhanced-phase2-complex-patterns.jsonl',
  'enhanced-phase2-complex-scenes.jsonl',
  'enhanced-phase3-edge-cases.jsonl',
  'enhanced-phase3-golden-patterns.jsonl',
  'enhanced-phase4-error-correction.jsonl',
  'enhanced-phase4-game-systems.jsonl',
];

async function main() {
  const allLines: string[] = [];
  let totalEntries = 0;

  console.log(`Merging ${ENHANCED_FILES.length} enhanced datasets...`);

  for (const filename of ENHANCED_FILES) {
    const filepath = path.join(ARCHIVE_DIR, filename);

    if (!fs.existsSync(filepath)) {
      console.warn(`⚠️  File not found: ${filename}`);
      continue;
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    console.log(`  ✓ ${filename}: ${lines.length} entries`);
    totalEntries += lines.length;
    allLines.push(...lines);
  }

  console.log(`\nTotal entries: ${totalEntries}`);
  console.log(`Writing to ${OUTPUT_FILE}...`);

  fs.writeFileSync(OUTPUT_FILE, allLines.join('\n') + '\n');
  console.log(`✅ Done! Merged ${totalEntries} entries.`);
}

main().catch(console.error);
