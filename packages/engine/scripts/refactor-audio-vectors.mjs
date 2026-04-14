import fs from 'fs';
import path from 'path';

const root = 'c:/Users/josep/Documents/GitHub/HoloScript';
const audioDir = path.join(root, 'packages/engine/src/audio');

const files = fs.readdirSync(audioDir).filter(f => f.endsWith('.ts'));

files.forEach(file => {
  const filePath = path.join(audioDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Add missing import if Vector3 is used
  if (content.includes('Vector3') && !content.includes("from '@holoscript/core'")) {
    content = "import type { Vector3 } from '@holoscript/core';\n" + content;
    changed = true;
  }

  // 2. Fix object to tuple conversions in returns and assignments
  // Match return { x: ..., y: ..., z: ... }
  content = content.replace(/return\s+\{\s*x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^\}]+)\s*\}/g, 'return [$1, $2, $3]');
  
  // Match assignments like vec = { x: ..., y: ..., z: ... }
  content = content.replace(/=\s+\{\s*x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^\}]+)\s*\}/g, '= [$1, $2, $3]');

  // 3. Fix spread operators
  content = content.replace(/\{\s*\.\.\.([^\}]+)\s*\}/g, (match, p1) => {
    // If it's likely a vector (based on name context in this repo)
    if (p1.includes('position') || p1.includes('rotation') || p1.includes('scale') || p1.includes('point') || p1.includes('vec') || p1.includes('forward') || p1.includes('up')) {
      return `[...${p1}]`;
    }
    return match;
  });

  // 4. Fix property access on known vectors
  // This is tricky without a parser, but we can do some common ones
  content = content.replace(/([a-zA-Z0-9_]+)\.x/g, (match, p1) => {
     if (['position', 'rotation', 'scale', 'point', 'forward', 'up', 'v1', 'v2', 'ap', 'ab', 'midpoint'].includes(p1)) {
       return `${p1}[0]`;
     }
     return match;
  });
  content = content.replace(/([a-zA-Z0-9_]+)\.y/g, (match, p1) => {
     if (['position', 'rotation', 'scale', 'point', 'forward', 'up', 'v1', 'v2', 'ap', 'ab', 'midpoint'].includes(p1)) {
       return `${p1}[1]`;
     }
     return match;
  });
  content = content.replace(/([a-zA-Z0-9_]+)\.z/g, (match, p1) => {
     if (['position', 'rotation', 'scale', 'point', 'forward', 'up', 'v1', 'v2', 'ap', 'ab', 'midpoint'].includes(p1)) {
       return `${p1}[2]`;
     }
     return match;
  });

  if (changed || content !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});

console.log('Audio directory refactored.');
