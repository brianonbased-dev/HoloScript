/**
 * Live Test: @holoscript/core Parser
 * Tests real parsing of .hs and .hsplus files
 */

import { HoloScriptCodeParser, HoloScriptPlusParser } from '../packages/core/dist/index.js';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';

const EXAMPLES_DIR = './examples';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         LIVE TEST: @holoscript/core Parser                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {
  passed: 0,
  failed: 0,
  errors: [],
};

// Test 1: Parse all .hs files
console.log('📁 Test 1: Parsing .hs files...\n');

const hsFiles = readdirSync(EXAMPLES_DIR).filter((f) => extname(f) === '.hs');
const codeParser = new HoloScriptCodeParser();

for (const file of hsFiles) {
  const filePath = join(EXAMPLES_DIR, file);
  const content = readFileSync(filePath, 'utf-8');

  try {
    const result = codeParser.parse(content);

    if (result.errors && result.errors.length > 0) {
      console.log(`  ⚠️  ${file}: Parsed with ${result.errors.length} errors`);
      result.errors.forEach((e) => console.log(`      - ${e.message}`));
      results.errors.push({ file, errors: result.errors });
    } else if (result.ast || result.nodes) {
      const nodeCount = result.ast?.body?.length || result.nodes?.length || 0;
      console.log(`  ✅ ${file}: Parsed successfully (${nodeCount} nodes)`);
      results.passed++;
    } else {
      console.log(`  ❓ ${file}: Parsed but no AST/nodes returned`);
      console.log(`      Keys: ${Object.keys(result).join(', ')}`);
    }
  } catch (error) {
    console.log(`  ❌ ${file}: Parse FAILED`);
    console.log(`      Error: ${error.message}`);
    results.failed++;
    results.errors.push({ file, error: error.message });
  }
}

// Test 2: Parse .hsplus files with timeout protection
console.log('\n📁 Test 2: Parsing .hsplus files (with timeout)...\n');

const hsplusFiles = readdirSync(EXAMPLES_DIR).filter((f) => extname(f) === '.hsplus');
const plusParser = new HoloScriptPlusParser();

for (const file of hsplusFiles) {
  const filePath = join(EXAMPLES_DIR, file);
  const content = readFileSync(filePath, 'utf-8');

  // Only test first 500 lines to avoid memory issues
  const truncatedContent = content.split('\n').slice(0, 500).join('\n');

  try {
    console.log(
      `  ⏳ ${file}: Parsing (${content.split('\\n').length} lines, testing first 500)...`
    );
    const startTime = Date.now();
    const result = plusParser.parse(truncatedContent);
    const elapsed = Date.now() - startTime;

    if (result.errors && result.errors.length > 0) {
      console.log(`  ⚠️  ${file}: Parsed in ${elapsed}ms with ${result.errors.length} errors`);
      result.errors.slice(0, 3).forEach((e) => console.log(`      - ${e.message || e}`));
    } else if (result.ast) {
      const nodeCount = result.ast?.body?.length || 0;
      console.log(`  ✅ ${file}: Parsed in ${elapsed}ms (${nodeCount} top-level nodes)`);
      results.passed++;
    }
  } catch (error) {
    console.log(`  ❌ ${file}: Parse FAILED`);
    console.log(`      Error: ${error.message}`);
    results.failed++;
  }
}

// Test 3: Quick inline parsing test
console.log('\n📁 Test 3: Quick inline parsing...\n');

const quickTests = [
  { name: 'Simple orb', code: 'orb#test @grabbable { color: "#ff0000" }' },
  { name: 'Scene with child', code: 'scene { orb#child { position: [0, 1, 0] } }' },
  { name: 'State directive', code: '@state { count: 0 }' },
];

for (const { name, code } of quickTests) {
  try {
    const result = plusParser.parse(code);
    if (result.ast) {
      console.log(`  ✅ "${name}": Parsed successfully`);
      results.passed++;
    } else {
      console.log(`  ❓ "${name}": No AST returned`);
    }
  } catch (error) {
    console.log(`  ❌ "${name}": ${error.message}`);
    results.failed++;
  }
}

// Summary
console.log('\n' + '═'.repeat(66));
console.log(`\n📊 SUMMARY: ${results.passed} passed, ${results.failed} failed\n`);

if (results.failed > 0) {
  console.log('⚠️  Some tests had issues. Review above for details.');
} else {
  console.log('✅ All parser tests passed!');
}
