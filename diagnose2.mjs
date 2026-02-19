import { parseHolo } from './packages/core/dist/index.js';
import * as fs from 'fs';

const file = 'examples/hololand/hub_gallery.holo';
const content = fs.readFileSync(file, 'utf8');
const result = parseHolo(content);
console.log('Errors:', result.errors.length);
result.errors.forEach(e => {
  console.log(`  L${e.line}: ${e.message}`);
  if (e.stack) console.log('  ' + e.stack.split('\n').slice(0,3).join('\n  '));
});
