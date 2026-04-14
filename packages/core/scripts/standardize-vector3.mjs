import fs from 'fs';
import path from 'path';

const searchDirs = [
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src',
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src'
];

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  content = content.replace(/\bVector3Tuple\b/g, 'Vector3');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Standardized Vector3Tuple to Vector3: ${filePath}`);
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
    } else if (file.endsWith('.ts')) {
      fixFile(fullPath);
    }
  });
}

searchDirs.forEach(dir => walk(dir));
