#!/usr/bin/env node
// Batch: emit (source, image) SVG pairs over a .holo corpus. No GPU, no browser.
// Usage: node scripts/holo-render-svg-batch.mjs <rootDir> <outDir>
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseHolo } from '@holoscript/core';
import { SVGCompiler } from '@holoscript/core/compiler';

const [root, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const EXCLUDE = /[\\/](\.scratch|node_modules|dist|\.next|\.bench-logs)[\\/]/;
const files = [];
(function walk(d){ for (const e of readdirSync(d,{withFileTypes:true})) {
  const f = path.join(d,e.name); if (EXCLUDE.test(f)) continue;
  if (e.isDirectory()) walk(f); else if (e.name.endsWith('.holo')) files.push(f);
}})(root);

const c = new SVGCompiler();
let ok=0, skip=0; const rows=[];
for (const f of files) {
  try {
    const src = readFileSync(f,'utf8');
    const r = parseHolo(src,{tolerant:true});
    if (!r.ast) { skip++; continue; }
    const { svg, elements } = c.compile(r.ast, '');
    if (elements === 0) { skip++; continue; }        // rendered nothing -> not a visual pair
    const id = Buffer.from(f).toString('base64url').slice(0,40);
    writeFileSync(path.join(outDir, id+'.svg'), svg);
    rows.push(JSON.stringify({ source: f, image: id+'.svg', elements, svgBytes: svg.length }));
    ok++;
  } catch { skip++; }
}
writeFileSync(path.join(outDir,'pairs.jsonl'), rows.join('\n')+'\n');
console.log(JSON.stringify({ scanned: files.length, paired: ok, skipped: skip, manifest: path.join(outDir,'pairs.jsonl') }));
