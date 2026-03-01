import { parseHolo } from '../packages/core/src/parser/HoloCompositionParser.js';

console.log('Testing individual parts of Full Example...\n');

// Test 1: Template with negation
console.log('Test 1: Template with negation (!state.isActive)');
const test1 = `
composition "Test" {
  template "Panel" {
    state { isActive: false }
    action toggle() {
      state.isActive = !state.isActive
    }
  }
}
`;
console.log('  Parsing...');
const r1 = parseHolo(test1);
console.log('  Result:', r1.success, r1.errors);

// Test 2: animate statement
console.log('\nTest 2: Animate statement');
const test2 = `
composition "Test" {
  logic {
    on_enter {
      animate "Panel" { scale: [1, 1, 1] }
    }
  }
}
`;
console.log('  Parsing...');
const r2 = parseHolo(test2);
console.log('  Result:', r2.success, r2.errors);

// Test 3: async action with if/await
console.log('\nTest 3: Async action with if/await');
const test3 = `
composition "Test" {
  logic {
    async action submit() {
      if validate(x) {
        state.status = "submitting"
        await api_call("/endpoint", { x: 1 })
      }
    }
  }
}
`;
console.log('  Parsing...');
const r3 = parseHolo(test3);
console.log('  Result:', r3.success, r3.errors);

console.log('\n✅ Individual tests done');
