/**
 * Audit 53 non-handler trait files: categorize by what they export
 */
import * as fs from 'fs';
import * as path from 'path';

const traitsDir = path.resolve(__dirname, '../packages/core/src/traits');
const vrtsPath = path.join(traitsDir, 'VRTraitSystem.ts');
const vrtsContent = fs.readFileSync(vrtsPath, 'utf-8');

const allFiles = fs.readdirSync(traitsDir)
  .filter(f => f.endsWith('Trait.ts') && f !== 'TraitTypes.ts');

const unregistered = allFiles.filter(f => {
  const basename = f.replace('.ts', '');
  return !vrtsContent.includes(`from './${basename}'`);
});

interface FileAudit {
  file: string;
  exports: string[];
  hasClass: boolean;
  hasInterface: boolean;
  hasFunction: boolean;
  hasDefaultConfig: boolean;
  hasLifecycle: boolean;
  lines: number;
  category: string;
}

const results: FileAudit[] = [];

for (const file of unregistered) {
  const content = fs.readFileSync(path.join(traitsDir, file), 'utf-8');
  const lines = content.split('\n').length;
  
  const exports: string[] = [];
  for (const m of content.matchAll(/export\s+(const|class|interface|type|function|enum)\s+(\w+)/g)) {
    exports.push(`${m[1]} ${m[2]}`);
  }
  
  const hasClass = /export\s+class\s/.test(content);
  const hasInterface = /export\s+interface\s/.test(content);
  const hasFunction = /export\s+function\s/.test(content);
  const hasDefaultConfig = /defaultConfig/.test(content);
  const hasLifecycle = /on(?:Attach|Detach|Update|Event)\s*[(:]/i.test(content);
  
  let category = 'unknown';
  if (hasDefaultConfig && hasLifecycle) category = 'HANDLER_READY'; // Has handler shape, might not export correctly
  else if (hasClass) category = 'CLASS';
  else if (hasFunction && lines > 50) category = 'UTILITY';
  else if (hasInterface && !hasFunction) category = 'TYPES_ONLY';
  else if (exports.every(e => e.startsWith('const') || e.startsWith('type') || e.startsWith('interface'))) category = 'CONSTANTS';
  else category = 'MIXED';
  
  results.push({ file, exports, hasClass, hasInterface, hasFunction, hasDefaultConfig, hasLifecycle, lines, category });
}

// Group by category
const groups: Record<string, FileAudit[]> = {};
for (const r of results) {
  groups[r.category] = groups[r.category] || [];
  groups[r.category].push(r);
}

for (const [cat, items] of Object.entries(groups).sort()) {
  console.log(`\n=== ${cat} (${items.length}) ===`);
  for (const item of items) {
    console.log(`  ${item.file} (${item.lines}L) → ${item.exports.slice(0, 3).join(', ')}${item.exports.length > 3 ? '...' : ''}`);
  }
}
