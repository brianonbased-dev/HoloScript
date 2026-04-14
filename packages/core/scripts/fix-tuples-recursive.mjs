import fs from 'fs';
import path from 'path';

const searchDirs = [
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src',
  'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src'
];

// Properties that are strictly expected to be tuples [x, y, z]
const vectorProperties = [
  'position', 'rotation', 'scale', 'velocity', 'force', 'direction', 'normal', 'forward', 'up', 'right',
  'size', 'offset', 'min', 'max', 'center', 'gravity', 'wind', 'acceleration', 'target', 'anchor', 'pose',
  'start', 'end', 'axis', 'currentPos', 'lastPosition', 'userPos', 'nodePos', 'soundPos', 'attackerPos',
  'interpolated', 'prev', 'current', 'targetPos', 'newPos', 'bonePose', 'jointPose'
];

const vecPropRegex = new RegExp(`(\\b(?:${vectorProperties.join('|')}))\\.(x|y|z|w)\\b`, 'g');

function fixFile(filePath) {
  if (filePath.includes('node_modules') || filePath.includes('dist')) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Property access replacements
  content = content.replace(vecPropRegex, (match, p1, p2) => {
    const map = { x: '0', y: '1', z: '2', w: '3' };
    return `${p1}[${map[p2]}]`;
  });

  // Handle specific cases like particle.position.x
  content = content.replace(/(\b(?:particle|joint|bone|point|jointPose|bonePose|interpolated|prev|current|targetPos|newPos|currentPos))\.(x|y|z|w)\b/g, (match, p1, p2) => {
    const map = { x: '0', y: '1', z: '2', w: '3' };
    return `${p1}[${map[p2]}]`;
  });

  // Handle { x, y, z } patterns for position/rotation/scale assignments
  // Look for assignment to known vector properties: position = { x: ..., y: ..., z: ... }
  content = content.replace(/(\b(?:position|rotation|scale|velocity|force|direction|normal|forward|up|right|size|offset|min|max|center|gravity|wind|acceleration|target|anchor|pose|start|end|axis))\s*=\s*\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*)\s*\}/g, '$1 = [$2, $3, $4]');
  
  // Handle literal declarations in records/objects
  // e.g. position: { x: pos.x, y: pos.y, z: pos.z }
  // First fix the pos.x internally via previous regex, then fix the container
  content = content.replace(/(\b(?:position|rotation|scale|velocity|force))\s*:\s*\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*)\s*\}/g, '$1: [$2, $3, $4]');

  // Handle { x, y, z, w } for rotation
  content = content.replace(/(\b(?:rotation|pose))\s*=\s*\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*),\s*w:\s*([^,}]*)\s*\}/g, '$1 = [$2, $3, $4, $5]');
  content = content.replace(/(\b(?:rotation|pose))\s*:\s*\{\s*x:\s*([^,}]*),\s*y:\s*([^,}]*),\s*z:\s*([^,}]*),\s*w:\s*([^,}]*)\s*\}/g, '$1: [$2, $3, $4, $5]');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
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

console.log('Finished bulk refactoring.');
