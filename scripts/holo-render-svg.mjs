#!/usr/bin/env node
// Cheapest headless .holo -> image (SVG) renderer. No GPU, no browser, no Playwright.
// Pure Node: parseHolo (tolerant) -> SVGCompiler.compile -> write SVG. The '' agentToken bypasses RBAC.
// Usage: node scripts/holo-render-svg.mjs <in.holo> [out.svg]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseHolo } from '@holoscript/core';
import { SVGCompiler } from '@holoscript/core/compiler';

const inPath = process.argv[2];
if (!inPath) { console.error('usage: holo-render-svg.mjs <in.holo> [out.svg]'); process.exit(2); }
const outPath = process.argv[3] ?? inPath.replace(/\.holo$/u, '.svg');

const r = parseHolo(readFileSync(inPath, 'utf8'), { tolerant: true });
if (!r.ast) { console.error(`no AST parsed from ${inPath}`); process.exit(1); }
const { svg, elements, groups } = new SVGCompiler().compile(r.ast, ''); // '' bypasses RBAC
writeFileSync(outPath, svg, 'utf8');
console.log(JSON.stringify({ outPath, bytes: svg.length, elements, groups }));
