#!/usr/bin/env node
/**
 * insert-hologram-templates.mjs
 * Inserts 3 new hologram wizard templates into WIZARD_TEMPLATES.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(
  __dirname,
  '..',
  'packages',
  'studio',
  'src',
  'lib',
  'presets',
  'wizardTemplates.ts'
);

let src = readFileSync(filePath, 'utf-8');

if (src.includes("'holographic-gallery'")) {
  console.log('holographic-gallery already present - skipping.');
  process.exit(0);
}

const dataPath = resolve(__dirname, 'hologram-templates-data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

function buildEntry(key, meta, code) {
  const tagsStr = meta.tags.map((t) => "'" + t + "'").join(', ');
  return [
    '',
    "  '" + key + "': {",
    "    id: '" + meta.id + "',",
    "    name: '" + meta.name + "',",
    "    description: '" + meta.description + "',",
    "    thumbnail: '" + meta.thumbnail + "',",
    '    tags: [' + tagsStr + '],',
    "    category: '" + meta.category + "',",
    '    code: `' + code + '`,',
    '  },',
  ].join('\n');
}

const sectionHeader =
  '\n  // ─── Hologram ─────────────────────────────────────────────────────────────────────\n';

const e1 = buildEntry(
  'holographic-gallery',
  data['holographic-gallery'].meta,
  data['holographic-gallery'].code
);
const e2 = buildEntry('memory-wall', data['memory-wall'].meta, data['memory-wall'].code);
const e3 = buildEntry('video-portal', data['video-portal'].meta, data['video-portal'].code);

const newTemplates = sectionHeader + e1 + '\n' + e2 + '\n' + e3;

const helpersMarker = '// ─── Helpers';
const helpersIdx = src.indexOf(helpersMarker);
if (helpersIdx === -1) {
  console.error('ERROR: Could not find Helpers marker.');
  process.exit(1);
}

const closingIdx = src.lastIndexOf('};', helpersIdx);
if (closingIdx === -1) {
  console.error('ERROR: Could not find closing };');
  process.exit(1);
}

const before = src.slice(0, closingIdx);
const after = src.slice(closingIdx);
src = before + newTemplates + '\n' + after;

writeFileSync(filePath, src, 'utf-8');

const newLineCount = src.split('\n').length;
console.log('Inserted 3 hologram templates (holographic-gallery, memory-wall, video-portal).');
console.log('File now has ' + newLineCount + ' lines.');
