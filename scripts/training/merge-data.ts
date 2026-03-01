import fs from 'fs';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

function merge() {
  const syntheticPath =
    'c:/Users/josep/Documents/GitHub/HoloScript/final_synthetic_standardized.jsonl';
  const goldenPath =
    'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript.jsonl';
  const outputPath =
    'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/combined_training_data.jsonl';

  const syntheticLines = fs
    .readFileSync(syntheticPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const goldenLines = fs
    .readFileSync(goldenPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim());

  const parser = new HoloScriptPlusParser();
  const validSynthetic: string[] = [];

  console.log(`Validating ${syntheticLines.length} synthetic entries...`);
  for (const line of syntheticLines) {
    try {
      const entry = JSON.parse(line);
      const result = parser.parse(entry.completion);
      if (result.success) {
        validSynthetic.push(line);
      }
    } catch (e) {
      // Skip broken JSON
    }
  }

  console.log(`Found ${validSynthetic.length} valid synthetic entries.`);
  const combined = [...goldenLines, ...validSynthetic];

  fs.writeFileSync(outputPath, combined.join('\n') + '\n', 'utf8');
  console.log(`Combined dataset written to ${outputPath} (${combined.length} total entries).`);
}

merge();
