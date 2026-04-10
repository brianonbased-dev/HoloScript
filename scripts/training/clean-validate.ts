import fs from 'fs';
import path from 'path';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

async function validate() {
  const dataPath =
    'c:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript-clean.jsonl';
  const reportPath = 'C:/Users/josep/Documents/GitHub/HoloScript/synthetic_validation_report.txt';

  const lines = fs
    .readFileSync(dataPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const parser = new HoloScriptPlusParser({ enableVRTraits: true, enableTypeScriptImports: true });

  let report = '';

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
      const codeLines = entry.completion.split('\n');
      const result = parser.parse(entry.completion);
      if (!result.success) {
        report += `ENTRY ${i + 1} ERRORS:\n`;
        result.errors.forEach((e: any) => {
          const lineContent = codeLines[e.line - 1] || '???';
          report += `- Line ${e.line} [${lineContent.trim()}], Col ${e.column}: ${e.message}\n`;
        });
        report += '\n';
      } else {
        report += `ENTRY ${i + 1} VALID\n\n`;
      }
    } catch (e: any) {
      report += `ENTRY ${i + 1} CRASH: ${e.message}\n\n`;
    }
  }

  fs.writeFileSync(reportPath, report, 'utf8');
  console.log('Report written to validation_report.txt');
}

validate().catch(console.error);
