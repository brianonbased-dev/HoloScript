import fs from 'fs';
import path from 'path';

const searchDirs = [
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src/traits',
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src'
];

function fixFile(filePath) {
  if (filePath.includes('node_modules') || filePath.includes('dist')) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Pattern: { x: ..., y: ..., z: ... } -> [..., ..., ...]
  // We need to be careful with things that ARE NOT vectors, but in these files, 
  // most {x, y, z} are indeed positions/rotations.
  content = content.replace(/\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*)\s*\}/g, '[$1, $2, $3]');
  
  // Pattern: { x: ..., y: ..., z: ..., w: ... }
  content = content.replace(/\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*),\s*w:\s*([^,}]*)\s*\}/g, '[$1, $2, $3, $4]');

  // Clean up any remaining object-style type definitions for Vector3
  content = content.replace(/:\s*\{\s*x:\s*number;?\s*y:\s*number;?\s*z:\s*number;?\s*\}/g, ': Vector3');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed literals: ${filePath}`);
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
    } else if (file.endsWith('.ts')) {
      fixFile(fullPath);
    }
  });
}

searchDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    walk(dir);
  }
});

console.log('Finished bulk literal fixing.');
