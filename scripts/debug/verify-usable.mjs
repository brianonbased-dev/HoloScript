// Quick verification that the parser is usable
import { parseHolo, HoloCompositionParser } from '../packages/core/src/index.js';
console.log('✅ Imports work:', !!parseHolo, !!HoloCompositionParser);
const result = parseHolo(`
  composition "Test" { 
    state { x: 1 } 
  }
`);
console.log('✅ Parse result:', result.success, 'Name:', result.ast?.name);
console.log('✅ State:', result.ast?.state?.properties);
console.log('\n🎉 Parser is usable!');
