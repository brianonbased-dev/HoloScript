import fs from 'fs';
import path from 'path';

const traitsDir = 'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src/traits';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  if (content.includes('Vector3') && 
      !content.includes('import { Vector3') && 
      !content.includes('import type { Vector3') &&
      !content.includes('export type Vector3') &&
      !content.includes('export interface Vector3')) {
    
    // Add import
    const importStmt = 'import type { Vector3 } from \'../types\';\n';
    content = importStmt + content;
    console.log(`Added Vector3 import to: ${filePath}`);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = fs.readdirSync(traitsDir).filter(f => f.endsWith('.ts'));
files.forEach(file => {
  fixFile(path.join(traitsDir, file));
});

console.log('Finished updating trait imports.');
