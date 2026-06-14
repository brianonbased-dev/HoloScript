#!/usr/bin/env node
/**
 * validate-holo-compile.mjs — headless parse + R3FCompiler check for a .holo file.
 *
 * Confirms the canonical .holo parses and dumps the resolved R3FNode tree shape
 * (node types + the props a raw-three walker needs: hsType, color, materialProps,
 * position, rotation, scale, light props). No render loop — runs in plain Node.
 *
 *   node scripts/validate-holo-compile.mjs examples/asset-pipeline-warehouse.holo
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'examples/asset-pipeline-warehouse.holo';
const src = readFileSync(file, 'utf8');

const core = await import('@holoscript/core');
const { HoloCompositionParser, R3FCompiler } = core;

const parser = new HoloCompositionParser();
const parsed = parser.parse(src);
console.log('parse.success =', parsed.success);
if (!parsed.success) {
  console.log('errors:', JSON.stringify(parsed.errors, null, 2));
  process.exit(1);
}
const ast = parsed.ast;
console.log('ast.type =', ast?.type, '| name =', ast?.name);
console.log('ast.objects =', ast?.objects?.length, '| lights =', ast?.lights?.length, '| templates =', ast?.templates?.length);

const compiler = new R3FCompiler();
const root = compiler.compileComposition(ast);

let n = 0;
function walk(node, depth) {
  n++;
  const p = node.props || {};
  const pick = (o, keys) => {
    const out = {};
    for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
    return out;
  };
  const summary = pick(p, [
    'hsType', 'color', 'position', 'rotation', 'scale', 'size',
    'emissive', 'emissiveIntensity', 'metalness', 'roughness', 'intensity',
  ]);
  if (p.materialProps) summary.materialProps = p.materialProps;
  console.log(
    '  '.repeat(depth) + `[${node.type}] ${node.id ?? ''} ` + JSON.stringify(summary)
  );
  for (const c of node.children ?? []) walk(c, depth + 1);
}
console.log('\n=== R3FNode tree (type + walker-relevant props) ===');
walk(root, 0);
console.log(`\ntotal nodes = ${n}`);
