import fs from 'fs';
import path from 'path';

const searchDirs = [
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src',
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src'
];

function fixFile(filePath) {
  if (filePath.includes('node_modules') || filePath.includes('dist')) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Check if Vector3 is used but not defined or imported
  // (Simplified check: if Vector3 is used and not imported from HoloScriptPlus or core types)
  if (content.includes('Vector3') && 
      !content.includes('import { Vector3') && 
      !content.includes('import type { Vector3') &&
      !content.includes('export type Vector3') &&
      !content.includes('export interface Vector3')) {
    
    // Find a good place to add the import
    // Look for existing imports
    const importMatch = content.match(/^import.*from.*;/m);
    if (importMatch) {
      content = 'import type { Vector3 } from \'../types\';\n' + content;
      console.log(`Added import to: ${filePath}`);
    } else {
      // No imports found, add at top
      content = 'import type { Vector3 } from \'../types\';\n' + content;
      console.log(`Added import (no existing) to: ${filePath}`);
    }
  }

  // Also fix the property access if I missed any (aggressive)
  // Matches any.x where any is Vector3-like
  // BUT only if not preceded by a [0-9] (to avoid picking up decimals)
  // AND only if followed by whitespace or operator
  content = content.replace(/(?<!\d)\b(pos|p|v|a|b|c|d|res|result|current|target|dir|direction|normal|up|forward|right|force|velocity|acceleration|last|min|max|center|start|end|node|bone|joint|tip)\b\.(x|y|z|w)\b/g, (match, p1, p2) => {
    const map = { x: '0', y: '1', z: '2', w: '3' };
    return `${p1}[${map[p2]}]`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.ts') && !file.includes('.test.')) {
      fixFile(fullPath);
    }
  });
}

searchDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    walk(dir);
  }
});

console.log('Finished adding imports and aggressive property fixing.');
