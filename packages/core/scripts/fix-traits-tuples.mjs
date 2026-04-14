import fs from 'fs';
import path from 'path';

const traitsDir = 'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src/traits';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Property access replacements
  // Matches .x, .y, .z, .w following a word that is likely a vector (position, rotation, scale, velocity, force, etc.)
  content = content.replace(/(\b(?:position|rotation|scale|velocity|force|direction|center|min|max|offset|gravity|wind|acceleration|target|anchor|pose|start|end|axis|normal|up|forward|right|currentPos|lastPosition|userPos|nodePos|soundPos|attackerPos))\.(x|y|z|w)\b/g, (match, p1, p2) => {
    const map = { x: '0', y: '1', z: '2', w: '3' };
    return `${p1}[${map[p2]}]`;
  });

  // Handle generic 's' or 'p' or 'v' in loops if they are known vectors
  // This is riskier so let's be more specific
  content = content.replace(/(\b(?:particle|joint|bone|point|jointPose|bonePose|interpolated|prev|current|targetPos|newPos|currentPos))\.(x|y|z|w)\b/g, (match, p1, p2) => {
    const map = { x: '0', y: '1', z: '2', w: '3' };
    return `${p1}[${map[p2]}]`;
  });

  // Handle { x, y, z } patterns
  // Pattern: { x: ..., y: ..., z: ... }
  content = content.replace(/\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*)\s*\}/g, '[$1, $2, $3]');
  // Pattern: { x: ..., y: ..., z: ..., w: ... }
  content = content.replace(/\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*),\s*w:\s*([^,}]*)\s*\}/g, '[$1, $2, $3, $4]');

  // Handle interface/type definitions in traits
  // Matches "originalScale: { x: number; y: number; z: number };"
  content = content.replace(/:\s*\{\s*x:\s*number;\s*y:\s*number;\s*z:\s*number;\s*\}/g, ': [number, number, number]');
  content = content.replace(/:\s*\{\s*x:\s*number;\s*y:\s*number;\s*z:\s*number;\s*w:\s*number;\s*\}/g, ': [number, number, number, number]');
  
  // Also handle without semicolons or with optional w
  content = content.replace(/:\s*\{\s*x:\s*number(,?)\s*y:\s*number(,?)\s*z:\s*number(,?)\s*\}/g, ': [number, number, number]');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
    return true;
  }
  return false;
}

const files = fs.readdirSync(traitsDir).filter(f => f.endsWith('.ts'));
let fixedCount = 0;
files.forEach(file => {
  if (fixFile(path.join(traitsDir, file))) {
    fixedCount++;
  }
});

console.log(`Total fixed files: ${fixedCount}`);
