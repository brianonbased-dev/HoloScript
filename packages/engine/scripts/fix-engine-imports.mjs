import fs from 'fs';
import path from 'path';

const engineDir = 'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace import from ../types or types to @holoscript/core
  content = content.replace(/from '\.?\.?\/types'/g, "from '@holoscript/core'");
  
  // Also handle cases like import { Vector3 } from '../types/index'
  content = content.replace(/from '\.?\.?\/types\/index'/g, "from '@holoscript/core'");

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed imports in: ${filePath}`);
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

walk(engineDir);
