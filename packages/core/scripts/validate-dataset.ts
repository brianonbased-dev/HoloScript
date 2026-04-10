import * as fs from 'fs';
import * as path from 'path';
import { HoloScriptPlusParser } from '../src/parser/HoloScriptPlusParser';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx validate-dataset.ts <path-to-jsonl>');
  process.exit(1);
}

const filePath = args[0];
const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`File not found: ${absolutePath}`);
  process.exit(1);
}

console.log(`Validating dataset: ${absolutePath}`);

const content = fs.readFileSync(absolutePath, 'utf-8');
const lines = content.split('\n').filter((line) => line.trim() !== '');

const parser = new HoloScriptPlusParser({ strict: false });
let total = 0;
let passed = 0;
let failed = 0;

const logFile = 'validation_failures.log';
fs.writeFileSync(logFile, ''); // Clear log

console.log(`Found ${lines.length} entries.`);

for (const line of lines) {
  total++;
  try {
    const entry = JSON.parse(line);
    // Support multiple formats seen in our datasets
    let code = entry.completion || entry.response || entry.text || entry.content;

    // Support Chat format (messages array)
    if (!code && entry.messages && Array.isArray(entry.messages)) {
      const lastMsg = entry.messages[entry.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const content = lastMsg.content;
        // Extract code block
        const match = content.match(/```holo\s*([\s\S]*?)```/);
        if (match) {
          code = match[1];
        } else {
          // If no holo block, try extracting generic block if it looks like code
          const genericMatch = content.match(/```\s*([\s\S]*?)```/);
          if (genericMatch) {
            code = genericMatch[1];
          } else {
            // Fallback to full content (might be raw code) but skip [Think] blocks if present
            code = content.replace(/\[Think\][\s\S]*?\[\/Think\]/g, '').trim();
          }
        }
      }
    }

    if (!code) {
      console.warn(
        `[WARN] Line ${total}: No code field found. Keys: ${Object.keys(entry).join(', ')}`
      );
      failed++;
      continue;
    }

    // Filter out documentation / non-code entries
    const trimmed = code.trim();
    if (trimmed.match(/^(To create|After creating|Here's how|This example|\*\*)/i)) {
      // console.log(`[SKIP] Line ${total}: Identified as documentation.`);
      continue;
    }

    const result = parser.parse(code);
    if (result.success) {
      passed++;
    } else {
      failed++;
      const errorMsg = `[FAIL] Line ${total}:\n${result.errors.map((e) => e.message).join('\n')}\nCODE:\n${code}\n${'-'.repeat(40)}\n`;
      fs.appendFileSync(logFile, errorMsg);
    }
  } catch (e) {
    failed++;
    console.error(`[ERROR] Line ${total}: JSON Parse Error or unexpected crash`, e);
    fs.appendFileSync(logFile, `[CRASH] Line ${total}: ${e}\n`);
  }

  if (total % 1000 === 0) {
    console.log(`Processed ${total}... (${((passed / total) * 100).toFixed(1)}% passing)`);
  }
}

const passRate = (passed / total) * 100;
console.log('='.repeat(40));
console.log(`RESULTS:`);
console.log(`Total: ${total}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${passRate.toFixed(2)}%`);
console.log(`Failures logged to: ${path.resolve(logFile)}`);
console.log('='.repeat(40));

if (passRate > 99) {
  process.exit(0);
} else {
  process.exit(1);
}
