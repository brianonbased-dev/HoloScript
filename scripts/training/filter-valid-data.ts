import fs from 'fs';
import readline from 'readline';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

async function filterValidEntries(inputFile: string, outputFile: string) {
  console.log(`Filtering ${inputFile} -> ${outputFile}`);

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    return;
  }

  // const fileStream = fs.createReadStream(inputFile);
  // const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // Switch to Sync reading to debug
  console.log('Reading file synchronously...');
  const content = fs.readFileSync(inputFile, 'utf8');
  const lines = content.split('\n');
  console.log(`Read ${lines.length} lines.`);

  for (const line of lines) {
    total++;
    if (total <= 5) console.log(`Processing line ${total}: ${line.substring(0, 50)}...`);
    if (total % 1000 === 0) console.log(`Processed: ${total}, Valid: ${valid}`);

    let code = line;

    // Handle JSONL if applicable
    if (line.trim().startsWith('{')) {
      try {
        const json = JSON.parse(line);
        code = json.completion || json.content || json.prompt || '';
      } catch (e) {
        continue;
      }
    }

    if (!code) continue;

    // Parse
    const result = parser.parse(code);
    if (result.success) {
      outputStream.write(line + '\n');
      valid++;
    }
  }

  console.log(`\nComplete.`);
  console.log(`Total: ${total}`);
  console.log(`Valid: ${valid} (${((valid / total) * 100).toFixed(1)}%)`);
  console.log(`Saved to ${outputFile}`);
}

const inputFile =
  'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training/cloud-training-redeemed.jsonl';
const outputFile =
  'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training/cloud-training-filtered.jsonl';

filterValidEntries(inputFile, outputFile);
