import { HoloCompositionParser } from './dist/index.js';

const source = `
  composition "Test" {
    enviroment {
      sky: "blue"
    }
  }
`;

const parser = new HoloCompositionParser();
const result = parser.parse(source);

console.log('Parse successful:', result.success);
console.log('Number of errors:', result.errors.length);
console.log('\nErrors:');
result.errors.forEach((error, i) => {
  console.log(`Error ${i + 1}:`);
  console.log('  Message:', error.message);
  console.log('  Suggestion:', error.suggestion);
  console.log('  Severity:', error.severity);
  console.log('');
});
