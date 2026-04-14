import fs from 'fs';
import path from 'path';

const root = 'c:/Users/josep/Documents/GitHub/HoloScript';
const srcDir = path.join(root, 'packages/engine/src');

function processDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      processDir(itemPath);
    } else if (item.endsWith('.ts')) {
      processFile(itemPath);
    }
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Add import if needed (but NOT if it's already defined or imported from three)
  if (content.includes('Vector3') && 
      !content.includes("from '@holoscript/core'") && 
      !content.includes('export interface Vector3') && 
      !content.includes('export type Vector3') &&
      !content.includes('import { Vector3 } from "three"') &&
      !content.includes('import { Vector3 } from \'three\'')) {
    content = "import type { Vector3 } from '@holoscript/core';\n" + content;
    changed = true;
  }

  // 2. Fix object literal assignments to tuples
  // Matching: { x: ..., y: ..., z: ... } 
  // We use a multi-line aware regex for the object contents
  content = content.replace(/=\s*\{\s*x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^\}]+)\s*\}/g, (match, x, y, z) => {
    changed = true;
    return `= [${x.trim()}, ${y.trim()}, ${z.trim()} ]`;
  });

  // Fix return literals
  content = content.replace(/return\s*\{\s*x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^\}]+)\s*\}/g, (match, x, y, z) => {
    changed = true;
    return `return [${x.trim()}, ${y.trim()}, ${z.trim()} ]`;
  });

  // 3. Fix spread operators ONLY for known vector properties to avoid mangling real objects
  const spreadRegex = /\{\s*\.\.\.\s*([a-zA-Z0-9_\. \(\)\[\]]+)\s*\}/g;
  content = content.replace(spreadRegex, (match, p1) => {
    const lower = p1.toLowerCase();
    // Only replace if it looks like a position/velocity/etc vector
    if (lower.includes('pos') || lower.includes('rot') || lower.includes('scale') || lower.includes('point') || lower.includes('vec') || lower.includes('forward') || lower.includes('up') || lower.includes('target') || lower.includes('vel')) {
       // Check if it's NOT inside another object with keys (this is hard with regex, but usually vectors are spread alone)
       changed = true;
       return `[...${p1} ]`;
    }
    return match;
  });

  // 4. Fix .x, .y, .z property access on known vectors
  // Be VERY careful here.
  const props = ['position', 'pos', 'velocity', 'vel', 'rotation', 'rot', 'scale', 'point', 'forward', 'up', 'target', 'listenerPos', 'sourcePos', 'edgePoint', 'midpoint', 'current'];
  props.forEach(p => {
    const regX = new RegExp(`\\b${p}\\.x\\b`, 'g');
    const regY = new RegExp(`\\b${p}\\.y\\b`, 'g');
    const regZ = new RegExp(`\\b${p}\\.z\\b`, 'g');
    if (regX.test(content)) { content = content.replace(regX, `${p}[0]`); changed = true; }
    if (regY.test(content)) { content = content.replace(regY, `${p}[1]`); changed = true; }
    if (regZ.test(content)) { content = content.replace(regZ, `${p}[2]`); changed = true; }
  });

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`Auto-fixed ${path.relative(srcDir, filePath)}`);
  }
}

processDir(srcDir);
console.log('Massive vector refactor complete.');
