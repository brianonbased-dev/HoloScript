import fs from 'fs';
import path from 'path';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

/**
 * Validates HoloScript code blocks in JSONL training data
 */
async function validateTrainingData() {
  const dataPath = path.join(
    'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript.jsonl'
  );
  console.log(`🔍 Reading training data from: ${dataPath}`);

  if (!fs.existsSync(dataPath)) {
    console.error('❌ Data file not found!');
    return;
  }

  const lines = fs.readFileSync(dataPath, 'utf8').split('\n');
  let validCount = 0;
  let errorCount = 0;

  const parser = new HoloScriptPlusParser({ enableVRTraits: true, enableTypeScriptImports: true });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const entry = JSON.parse(line);
      const content = entry.completion;

      try {
        const result = parser.parse(content);
        if (result.success) {
          validCount++;
        } else {
          console.error(
            `❌ Validation Error at Line ${i + 1}: ${JSON.stringify(result.errors.map((e: any) => e.message))}`
          );
          errorCount++;
        }
      } catch (pErr: any) {
        console.error(`❌ Parser Crash at Line ${i + 1}: ${pErr.message}`);
        errorCount++;
      }
    } catch (jErr: any) {
      console.error(`❌ JSON Parse Error at Line ${i + 1}: ${jErr.message}`);
      errorCount++;
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     📊 HoloScript Training Data Validation Report          ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Entries:  ${(validCount + errorCount).toString().padEnd(41)} ║`);
  console.log(`║  Valid:          ${validCount.toString().padEnd(41)} ║`);
  console.log(`║  Errors:         ${errorCount.toString().padEnd(41)} ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

validateTrainingData().catch(console.error);
