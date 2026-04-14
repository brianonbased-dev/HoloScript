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

  // Pattern to remove internal Vector3 interface definitions
  // Matches "interface Vector3 { x: number; y: number; z: number; }" or similar
  const interfaceRegex = /interface\s+Vector3\s*\{[^}]*x:\s*number;[^}]*y:\s*number;[^}]*z:\s*number;[^}]*\}/g;
  content = content.replace(interfaceRegex, '');

  // Pattern to remove internal Vector3 type definitions if they are objects
  const typeObjectRegex = /type\s+Vector3\s*=\s*\{\s*x:\s*number;?\s*y:\s*number;?\s*z:\s*number;?\s*\}/g;
  content = content.replace(typeObjectRegex, '');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed internal types: ${filePath}`);
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
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fixFile(fullPath);
    }
  });
}

searchDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    walk(dir);
  }
});

console.log('Finished removing internal Vector3 definitions.');
