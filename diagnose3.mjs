import { parseHolo } from './packages/core/dist/index.js';
import * as fs from 'fs';

// Binary search with tolerance check (need balanced braces in partial)
const content = fs.readFileSync('examples/hololand/hub_gallery.holo', 'utf8');
const lines = content.split('\n');

// Try progressively more content - looking for actual parse errors not just EOF
for (let i = 5; i <= lines.length; i += 1) {
  const partial = lines.slice(0, i).join('\n') + '\n}}}'; // Close any open braces  
  const result = parseHolo(partial);
  const nonEofErrors = result.errors.filter(e => !e.message.includes('EOF'));
  if (nonEofErrors.length > 0) {
    console.log(`First non-EOF error at line ${i}: ${nonEofErrors[0].message}`);
    console.log('Lines around error:');
    console.log(lines.slice(Math.max(0,i-5), i+2).join('\n'));
    break;
  }
}
