import fs from 'fs';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

function debug() {
  const dataPath = 'c:/Users/josep/Documents/GitHub/HoloScript/final_synthetic_standardized.jsonl';
  const lines = fs
    .readFileSync(dataPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const lineIndex = 14; // Entry 15
  const entry = JSON.parse(lines[lineIndex]);
  const parser = new HoloScriptPlusParser();
  const result = parser.parse(entry.completion);

  console.log('--- ENTRY ' + (lineIndex + 1) + ' ---');
  console.log('Success:', result.success);
  if (!result.success) {
    const codeLines = entry.completion.split('\n');
    result.errors.forEach((e: any) => {
      console.log(`Error: Line ${e.line}, Col ${e.column}: ${e.message}`);
      console.log(`Content: ${codeLines[e.line - 1]}`);
    });
  } else {
    console.log('VALIIIID!');
  }
}

debug();
