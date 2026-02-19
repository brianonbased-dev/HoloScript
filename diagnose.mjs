import { parseHolo } from './packages/core/dist/index.js';
import * as fs from 'fs';

const files = [
  'examples/real-world/escape-room.holo',
  'examples/hololand/hub_gallery.holo',
  'examples/hololand/roadmap_center.holo',
  'examples/platforms/openxr-app.holo',
  'examples/sample-projects/multiplayer-room.holo',
  'examples/platforms/godot-scene.holo',
  'examples/platforms/ios-ar-app.holo',
  'examples/brittney-workspace.holo',
  'examples/sample-projects/physics-playground.holo',
  'examples/platforms/unreal-scene.holo',
  'examples/platforms/webgpu-demo.holo',
  'examples/interactive-tutorial.holo',
  'examples/product-viewer.holo',
  'examples/quickstart/test_diagnostics.holo',
];

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const result = parseHolo(content);
    if (result.errors.length > 0) {
      console.log(`\n=== ${file} ===`);
      result.errors.slice(0, 3).forEach(e => console.log(`  L${e.line}: ${e.message}`));
    } else {
      console.log(`✓ ${file}`);
    }
  } catch(e) {
    console.log(`\n=== ${file} === THREW: ${e}`);
  }
}
