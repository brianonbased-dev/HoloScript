import * as fs from 'fs';
import * as path from 'path';
import { HoloCompositionParser } from '../../core/src/parser/HoloCompositionParser';
import { GLTFPipeline } from '../../core/src/compiler/GLTFPipeline';

const src = fs.readFileSync(path.resolve(__dirname, '../../..', 'examples/native-assets/fire-dragon.holo'), 'utf-8');
const parser = new HoloCompositionParser({ tolerant: true });
const r = parser.parse(src);
console.log('Parse errors:', r.errors.length);
console.log('Objects:', r.ast?.objects.length);

if (!r.ast) { console.error('No AST'); process.exit(1); }

const pipeline = new GLTFPipeline({ format: 'glb' });
const result = pipeline.compile(r.ast, undefined as any);
console.log('Stats:', JSON.stringify(result.stats, null, 2));

if (result.binary) {
  const out = path.resolve(__dirname, '..', 'public/models/dragon.glb');
  fs.writeFileSync(out, Buffer.from(result.binary));
  console.log('Written:', result.binary.byteLength, 'bytes to', out);
} else {
  console.error('No binary output');
}
