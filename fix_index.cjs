const fs = require('fs');
const path = require('path');

const INDEX_TS_PATH = path.join(__dirname, 'packages/core/src/index.ts');

let content = fs.readFileSync(INDEX_TS_PATH, 'utf8');

// The framework replacements
const frameworkReplacements = [
  'ai', 'agents', 'behavior', 'economy', 'learning', 'negotiation', 'skills', 'training'
];

// The engine replacements
const engineReplacements = [
  'camera', 'character', 'choreography', 'combat', 'dialogue', 'ecs', 'environment',
  'gameplay', 'gpu', 'hologram', 'input', 'materials', 'navigation', 'orbital',
  'particles', 'postfx', 'procedural', 'scene', 'shader', 'spatial', 'terrain',
  'tilemap', 'vr', 'world'
];

// Simple line replacer
for (const domain of frameworkReplacements) {
  content = content.replace(new RegExp(`from '\\.\/${domain}';`, 'g'), `from '@holoscript/framework/${domain}';`);
  content = content.replace(new RegExp(`from '\\.\/${domain}/(.*?)';`, 'g'), `from '@holoscript/framework/${domain}';`);
}

for (const domain of engineReplacements) {
  content = content.replace(new RegExp(`from '\\.\/${domain}';`, 'g'), `from '@holoscript/engine/${domain}';`);
  content = content.replace(new RegExp(`from '\\.\/${domain}/(.*?)';`, 'g'), `from '@holoscript/engine/${domain}';`);
}

fs.writeFileSync(INDEX_TS_PATH, content, 'utf8');
console.log('Fixed index.ts imports');
