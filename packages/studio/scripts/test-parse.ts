import * as fs from 'fs';
import * as path from 'path';
import { HoloCompositionParser } from '../../core/src/parser/HoloCompositionParser';
import { GLTFPipeline } from '../../core/src/compiler/GLTFPipeline';

const abs = path.resolve(__dirname, '..', '../../examples/native-assets/fire-dragon.holo');
const src = fs.readFileSync(abs, 'utf-8');
const parser = new HoloCompositionParser({ tolerant: true });
const r = parser.parse(src);

if (!r.ast) {
  console.error('No AST');
  process.exit(1);
}

const lines: string[] = [];
lines.push(`Objects: ${r.ast.objects.length}, Errors: ${r.errors.length}`);

// Show first 20 root objects and their children
for (const obj of r.ast.objects.slice(0, 25)) {
  const pos = obj.properties.find((p) => p.key === 'position');
  const geo = obj.properties.find((p) => p.key === 'geometry');
  const mat = obj.properties.find((p) => p.key === 'material');
  const childCount = obj.children?.length ?? 0;
  lines.push(
    `${obj.name}: geo=${geo?.value ?? '?'} pos=${JSON.stringify(pos?.value)} mat=${mat?.value ?? '-'} ch=${childCount}`
  );
}

// Compile and show glTF nodes
const pipeline = new GLTFPipeline({ format: 'gltf' });
const result = pipeline.compile(r.ast, undefined as unknown as string);
if (result.json) {
  const gltf = result.json as Record<string, unknown[]>;
  lines.push(
    `\nGLTF: ${gltf.nodes?.length} nodes, ${gltf.meshes?.length} meshes, ${gltf.materials?.length} mats`
  );
  for (const node of (gltf.nodes || []).slice(0, 25)) {
    const t = (node.translation || [0, 0, 0]).map((v: number) => v.toFixed(2));
    lines.push(
      `  ${node.name}: t=[${t}] ch=${node.children?.length ?? 0} mesh=${node.mesh ?? '-'}`
    );
  }
}

fs.writeFileSync(path.resolve(__dirname, '..', 'dragon-debug.txt'), lines.join('\n'));
console.log('Written to dragon-debug.txt');
