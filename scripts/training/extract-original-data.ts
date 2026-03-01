import fs from 'fs';
import readline from 'readline';

const sourceFile =
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/brittney-v502-extreme-edge-cases.jsonl';
const targetFile =
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript.jsonl';

const prompts = [
  'Create a quantum computing integration for procedural generation',
  'Create an AI consciousness simulation system',
  'Create a reality-blending AR system that seamlessly merges virtual and physical',
  'Create a swarm intelligence AI system for emergent behavior',
];

const sourceFiles = [
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/brittney-v5-consolidated.jsonl',
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/brittney-v501-new-features.jsonl',
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/brittney-v5-ALL-SESSIONS-MERGED.jsonl',
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/brittney-v502-all-new-features.jsonl',
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/brittney-v502-extreme-edge-cases.jsonl',
];

async function extract() {
  const results: string[] = new Array(prompts.length).fill('');

  for (const src of sourceFiles) {
    if (!fs.existsSync(src)) continue;
    console.log(`Checking ${src}...`);

    const fileStream = fs.createReadStream(src);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      try {
        const json = JSON.parse(line);
        const index = prompts.indexOf(json.prompt);
        // Only fill if not already found
        if (index !== -1 && !results[index]) {
          // Heuristic check for corruption (simple length check or keyword check)
          if (json.completion.length > 500) {
            results[index] = line;
            console.log(`  Found Entry ${index + 1}`);
          }
        }
      } catch {
        continue;
      }
    }
  }

  // Filter out any missing entries
  const foundLines = results.filter((l) => l);
  fs.writeFileSync(targetFile, foundLines.join('\n'), 'utf8');
  console.log('Final extraction count: ' + foundLines.length + '/' + prompts.length);
}

extract();
