import fs from 'fs';
import path from 'path';
import { HoloCompositionParser } from '@holoscript/core';

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      if (file.endsWith('.holo') || file.endsWith('.hs') || file.endsWith('.hsplus')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

async function validateExamples() {
  const rootDir = process.cwd();
  const packagesDir = path.join(rootDir, 'packages');
  const filesToValidate = walk(packagesDir).filter(file => !file.includes('node_modules'));

  console.log(`Found ${filesToValidate.length} HoloScript files to validate.`);

  let hasErrors = false;
  const parser = new HoloCompositionParser();

  for (const file of filesToValidate) {
    const source = fs.readFileSync(file, 'utf8');
    
    // Attempt parse
    try {
      const result = parser.parse(source, { tolerant: true });
      if (result.errors && result.errors.length > 0) {
        console.error(`\n[ERROR] Failed to parse: ${file}`);
        for (const err of result.errors) {
          console.error(`  -> ${err.message || err}`);
        }
        hasErrors = true;
      } else {
        console.log(`[OK] ${path.relative(rootDir, file)}`);
      }
    } catch (e: any) {
      console.error(`\n[FATAL] Parser crashed on: ${file}`);
      console.error(e.message);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\nValidation failed.');
    process.exit(1);
  } else {
    console.log('\nAll files parsed successfully!');
    process.exit(0);
  }
}

validateExamples();
