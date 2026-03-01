import fs from 'fs';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

const inputFile =
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript.jsonl';
const outputFile =
  'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript-clean.jsonl';

function cleanHoloScript() {
  console.log('Cleaning Hallucinated HoloScript...');

  if (!fs.existsSync(inputFile)) {
    console.error('Input file not found');
    return;
  }

  const raw = fs.readFileSync(inputFile, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim());
  let validCount = 0;
  let processedEntries: string[] = [];

  const parser = new HoloScriptPlusParser();

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    try {
      const json = JSON.parse(line);
      let code = json.completion || json.output;

      // 1. Strict Filtering
      // If it doesn't start with a keyword, it MUST contain a code block.
      const keywordsRegex =
        /^(npc|scene|quest|dialogue|item|ability|achievement|stateMachine|sequence|localizedText|talentTree|skill|recipe|interactive|collectible|networked|spawnPoint|party|chat|pvp|matchmaking|leaderboard|trading|auctionHouse|friends|guild|reconnection|skill|module|object)\b/;

      let isCode = keywordsRegex.test(code.trim());

      // Reject top-level JSON objects/arrays (not valid HoloScript nodes)
      if (code.trim().startsWith('{') || code.trim().startsWith('[')) {
        // console.log(`Skipping Entry ${i+1}: Top level JSON snippet.`);
        continue;
      }

      if (!isCode) {
        const match = code.match(/```(?:holoscript|json)?([\s\S]*?)```/);
        if (match) {
          code = match[1].trim();
          isCode = true;
          // Check again for top-level JSON in matched block
          if (code.startsWith('{') || code.startsWith('[')) continue;
        }
      }

      if (!isCode) {
        // console.log(`Skipping Entry ${i+1}: No code found.`);
        continue;
      }

      // 2. Syntax Standardization

      // Remove trailing ')' after '}' which appears in some hallucinations like "npc (...) { ... })"
      code = code.replace(/}\s*\)$/gm, '}');

      // module -> object
      code = code
        .replace(/module\s+"/g, 'object "')
        .replace(/\bmodule\b/g, 'object')

        // Quote arrow functions
        .replace(
          /(\w+):\s*(\([^)]*\)\s*=>\s*{[\s\S]*?})(,?)/gm,
          (match: string, key: string, func: string, comma: string) => {
            const escaped = func.replace(/"/g, '\\\\"'); // Double escape for JSON string inside string
            const stringified = escaped.replace(/\n\s*/g, ' ');
            return `${key}: "${stringified}"${comma}`;
          }
        )
        // Simple arrow: onComplete: () => ...
        .replace(
          /(\w+):\s*(\(\)\s*=>\s*[^,{}\n]+)(,?)/g,
          (match: string, key: string, func: string, comma: string) => {
            return `${key}: "${func.replace(/"/g, '\\\\"')}"${comma}`;
          }
        );

      // Quote Complex Expressions
      const expressionKeys = ['condition', 'trigger', 'onDamage', 'onSensory', 'onTimeout'];
      expressionKeys.forEach((key) => {
        const regex = new RegExp(`(${key}:\\s*)([^{}\\n",]+)(,?)`, 'g');
        code = code.replace(regex, (match, prefix, val, suffix) => {
          val = val.trim();
          if (
            val === 'true' ||
            val === 'false' ||
            !isNaN(Number(val)) ||
            val.startsWith('"') ||
            val.startsWith('{') ||
            val.startsWith('[')
          )
            return match;
          return `${prefix}"${val.replace(/"/g, '\\\\"')}"${suffix}`;
        });
      });

      // Fix lists [ ] [ ] -> [ ], [ ]
      code = code.replace(/\]\s*\[/g, '], [');

      // Fix: Add comma ONLY to closing braces of inner properties (INDENTED), NOT root.
      code = code.replace(/^(\s+)}\s*$/gm, (match, indent) => {
        if (indent.length > 0) return `${indent}},`;
        return match;
      });

      // Strict Top-Level Comma Cleanup (Remove commas from unindented closing braces)
      code = code.replace(/^}\s*,/gm, '}');

      // Clean up semicolons
      code = code.replace(/;\s*$/gm, ''); // Remove semicolons at end of lines
      code = code.replace(/,\s*$/gm, ','); // Normalize
      code = code.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing comma before closing brace

      // 3. Re-validate
      // If parsed successfully, keep it.
      const result = parser.parse(code);

      if (result.success) {
        // Update the JSON
        if (json.completion) json.completion = code;
        if (json.output) json.output = code;
        processedEntries.push(JSON.stringify(json));
        validCount++;
      } else {
        // console.log(`Discarding Entry ${i+1}: Still invalid after cleaning.`);
      }
    } catch (e) {
      console.error(`Error processing entry ${i + 1}`);
    }
  }

  fs.writeFileSync(outputFile, processedEntries.join('\n'), 'utf8');
  console.log(`Cleaned file saved to ${outputFile}`);
  console.log(`Total Input: ${lines.length}`);
  console.log(`Total Saved (100% Valid): ${processedEntries.length}`);
}

cleanHoloScript();
