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

  // VERY aggressive property fixing
  // Matches <any_var>.<x|y|z|w>
  // Filter out some common non-vector things like "this", "e", "event", "config", "props"
  const propertyRegex = /\b(?!(?:this|e|event|config|props|state|settings|options|ctx|context|math|Math|window|document|console|JSON)\b)([a-zA-Z0-9_$]+)\.(x|y|z|w)\b/g;
  
  content = content.replace(propertyRegex, (match, p1, p2) => {
    const map = { x: '0', y: '1', z: '2', w: '3' };
    return `${p1}[${map[p2]}]`;
  });

  // Fix multiline literals { x: ..., y: ..., z: ... }
  // This version handles newlines and nested calls
  content = content.replace(/\{\s*x:\s*([^,}]*?)\s*,\s*y:\s*([^,}]*?)\s*,\s*z:\s*([^,}]*?)\s*\}/g, '[$1, $2, $3]');
  content = content.replace(/\{\s*x:\s*([^,}]*?)\s*,\s*y:\s*([^,}]*?)\s*,\s*z:\s*([^,}]*?)\s*,\s*w:\s*([^,}]*?)\s*\}/g, '[$1, $2, $3, $4]');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Aggressively fixed: ${filePath}`);
    return true;
  }
  return false;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
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

searchDirs.forEach(dir => walk(dir));

console.log('Finished total aggressive fixing.');
