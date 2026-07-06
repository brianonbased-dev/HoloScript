import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

function standardize(code: string): string {
  return code
    .replace(/\bclass\b\s+([a-zA-Z_]\w*)/g, 'object "$1"')
    .replace(/\binterface\b\s+([a-zA-Z_]\w*)/g, 'object "$1"')
    .replace(/\bpublic\b|\bprivate\b|\bprotected\b/g, '')
    .replace(/^\s*action\s+(?=[a-zA-Z_])/gm, 'function ')
    .replace(/\b(ability|zone|portal|pattern|effect|algorithm)\s+(?!:)/g, 'object ')
    .replace(/^\s*\b(if|for|while|forEach)\b\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, '@$1 $2 {')
    .replace(/^\s*\belse\b\s*{\s*(?:\/\/.*)?$/gm, '@else {')
    .replace(/^\s*\belse\s+if\b\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, '@else @if $2 {')
    .replace(
      /^\s*(?!@|return|if|for|while|switch|catch)(\w+)\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm,
      'function $1 {'
    )
    .replace(/(\w+)\s*:\s*function\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, 'function $1 {')
    .replace(/(\w+)\s*:\s*\((.*?)\)\s*{\s*(?:\/\/.*)?$/gm, 'function $1 {')
    .replace(/(\w+)\s*:\s*\(.*?\)\s*=>\s*{\s*(?:\/\/.*)?$/gm, 'function $1 {')
    .replace(/\b(void|bool|int|string|float|number|any|List<.*?>)\s+function\s+/g, 'function ')
    .replace(/<.*?>/g, '')
    .replace(/object\s+"([^"]+)"\s+extends\s+\w+/g, 'object "$1"')
    .replace(/(\w+)\s*:\s*(\w+)\s*=([\s\S]*?);?$/gm, '$1: $3')
    .replace(/(\w+)\s*=\s*new\s+(\w+)\s*\(.*?\)/g, 'spawn "$2"')
    .replace(/(\w+)\.(\w+)/g, '$1 $2')
    .replace(/(\w+)\s*\((.*?)\)/g, (match, p1, p2) => (p2.trim() ? `${p1} ${p2.trim()}` : p1))
    .replace(/^(\s*)@?on_(?!entry|exit)([\w_]+)/gm, '$1@on_$2')
    .replace(/:\s*(\w+)\s*\|/g, ': "$1" |')
    .replace(/:(\s*)"([^"]+)"(\s*\|(\s*)"([^"]+)")+/g, ':$1"$2"')
    .replace(/\},/g, '}')
    .replace(/\],/g, ']')
    .replace(/,(\s*[\}\]])/g, '$1')
    .replace(/;$/gm, '')
    .replace(/^(\s*)npc\b/gm, '$1npc');
}

async function auditFile(filePath: string, sampleSize: number = 100) {
  console.log(`Auditing: ${filePath} (Sample size: ${sampleSize})`);

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const parser = new HoloScriptPlusParser({ enableVRTraits: true, enableTypeScriptImports: true });
  let total = 0;
  let validRaw = 0;
  let validStandardized = 0;
  let errors = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (total >= sampleSize) break;

    try {
      const entry = JSON.parse(line);
      let rawCode = '';

      if (entry.messages && Array.isArray(entry.messages)) {
        const assistantMsg = [...entry.messages].reverse().find((m: any) => m.role === 'assistant');
        if (assistantMsg) rawCode = assistantMsg.content;
      } else {
        rawCode = entry.completion || entry.output || '';
      }

      const hasMarkdown = rawCode.includes('```');
      let code = rawCode;
      if (hasMarkdown) {
        const match = rawCode.match(/```(?:holoscript|hsplus|holo)?\n([\s\S]*?)```/);
        if (match) code = match[1];
      }

      if (!code.trim()) {
        total++;
        continue;
      }

      const rawResult = parser.parse(code);
      if (rawResult.success) validRaw++;

      const stdCode = standardize(code);
      const stdResult = parser.parse(stdCode);
      if (stdResult.success) {
        validStandardized++;
      } else {
        errors++;
        if (
          errors <= 5 &&
          (filePath.includes('cloud-training-redeemed') ||
            filePath.includes('test_redemption.jsonl'))
        ) {
          console.log(`[DEBUG] Failure Sample (${path.basename(filePath)}):`);
          console.log(`  Code: "${code.substring(0, 200)}..."`);
          console.log(`  Error: ${result.errors[0]?.message} at line ${result.errors[0]?.line}`);
        }
        if (filePath.includes('cloud-training-final') && errors <= 1) {
          console.log(`[DEBUG] Cloud Standardization - Before:\n${code.substring(0, 200)}`);
          console.log(`[DEBUG] Cloud Standardization - After:\n${stdCode.substring(0, 200)}`);
          console.log(
            `[DEBUG] Error: ${stdResult.errors[0]?.message} at ${stdResult.errors[0]?.line}:${stdResult.errors[0]?.column}`
          );
        }
        if (filePath.includes('futuristic-holoscript') && errors <= 1) {
          console.log(`[DEBUG] Golden Standardization - Before:\n${code.substring(0, 200)}`);
          console.log(`[DEBUG] Golden Standardization - After:\n${stdCode.substring(0, 200)}`);
          console.log(
            `[DEBUG] Error: ${stdResult.errors[0]?.message} at ${stdResult.errors[0]?.line}:${stdResult.errors[0]?.column}`
          );
        }
      }
    } catch (e: any) {
      errors++;
      if (errors <= 5 && filePath.includes('cloud-training-redeemed')) {
        console.log(`[ERROR] Parser Crash: ${e.message}`);
      }
    }
    total++;
  }

  console.log(`Results for ${filePath}:`);
  console.log(`  - Total Sampled: ${total}`);
  console.log(`  - Valid (Raw): ${validRaw} (${((validRaw / total) * 100).toFixed(1)}%)`);
  console.log(
    `  - Valid (Standardized): ${validStandardized} (${((validStandardized / total) * 100).toFixed(1)}%)`
  );
  console.log(`-----------------------------------`);
}

async function runAudit() {
  const filesToAudit = [
    // 'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/futuristic-holoscript.jsonl',
    // 'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training-data/combined_training_data.jsonl',
    'C:/Users/josep/Documents/GitHub/HoloScript/test_redemption.jsonl',
    'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training/cloud-training-redeemed.jsonl',
    'C:/Users/josep/Documents/GitHub/AI_Workspace/Brittney/training/brittney-v4-cloud-training-final.jsonl',
    'C:/Users/josep/Documents/GitHub/AI_Workspace/uAA2/training/holoscript-advanced-train.jsonl',
    'C:/Users/josep/Documents/GitHub/AI_Workspace/_archive/2026-01-cleanup/redundant-datasets/brittney-v4-OMNISCIENT.jsonl',
    'C:/Users/josep/Documents/GitHub/AI_Workspace/_archive/2026-01-cleanup/redundant-datasets/brittney-v4-FINAL-SUPREME.jsonl',
  ];

  for (const file of filesToAudit) {
    if (fs.existsSync(file)) {
      await auditFile(file, 500); // Sample 500 from each
    } else {
      console.log(`File not found: ${file}`);
    }
  }
}

runAudit().catch(console.error);
