/**
 * Minimal Parser Debug Test
 * Isolates the memory issue in HoloScriptPlusParser
 */

import { HoloScriptPlusParser } from '../packages/core/dist/index.js';

console.log('Minimal Parser Test\n');

const parser = new HoloScriptPlusParser();

// Test 1: Empty string
console.log('Test 1: Empty string...');
try {
  const r1 = parser.parse('');
  console.log('  ✅ Passed');
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test 2: Simple orb
console.log('Test 2: Simple orb...');
try {
  const r2 = parser.parse('orb#test { color: "red" }');
  console.log('  ✅ Passed');
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test 3: Just @state
console.log('Test 3: @state directive...');
try {
  const r3 = parser.parse('@state { count: 0 }');
  console.log(`  ✅ Passed (${JSON.stringify(r3.ast?.root?.type || 'no root')})`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test 4: Scene with trait
console.log('Test 4: Scene with trait...');
try {
  const start = Date.now();
  const r4 = parser.parse(`
scene {
  orb#ball @grabbable {
    color: "#ff0000"
    position: [0, 1, 0]
  }
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test 5: Multi-line block comment
console.log('Test 5: Block comment...');
try {
  const start = Date.now();
  const r5 = parser.parse(`
/**
 * This is a comment
 */
scene { }
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test 6: State with complex object
console.log('Test 6: Complex @state...');
try {
  const start = Date.now();
  const r6 = parser.parse(`
@state {
  isRecording: false
  recordingDuration: 0
  clipCount: 0
  viewCount: 0
  engagementScore: 0
  heatmapData: []
  surveyResponses: []
  currentVariant: "A"
}
`);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

// Test 7: Larger scene (timeout test)
console.log('Test 7: Larger scene (10 orbs)...');
try {
  const start = Date.now();
  let code = 'scene {\n';
  for (let i = 0; i < 10; i++) {
    code += `  orb#ball${i} @grabbable { color: "#ff0000", position: [${i}, 0, 0] }\n`;
  }
  code += '}';

  const r7 = parser.parse(code);
  console.log(`  ✅ Passed in ${Date.now() - start}ms`);
} catch (e) {
  console.log(`  ❌ Failed: ${e.message}`);
}

console.log('\n✅ All minimal tests completed');
