import { createGLTFPipeline } from '../src/compiler/GLTFPipeline';
import { getRBAC } from '../src/compiler/identity/AgentRBAC';

// Bypass RBAC for test compilation
const rbac = getRBAC();
rbac.checkAccess = () =>
  ({ allowed: true, agentRole: 'orchestrator' }) as ReturnType<typeof rbac.checkAccess>;

import type { HoloComposition, HoloObjectDecl } from '../src/parser/HoloCompositionTypes';

console.log('Memory before: ', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

const objects: HoloObjectDecl[] = [];
// 50,000 objects corresponds to roughly what the smart-factory logic limits
for (let i = 0; i < 50000; i++) {
  objects.push({
    type: 'ObjectDecl',
    id: `machine_${i}`,
    name: `Machine${i}`,
    traits: [],
    properties: [
      { key: 'geometry', value: 'cube' },
      { key: 'position', value: [i * 2, 0, i * 2] },
      { key: 'color', value: '#ff0000' },
    ],
    children: [],
  });
}

const comp: HoloComposition = {
  type: 'Composition',
  id: 'smart-factory',
  objects: objects,
  globalTraits: [],
  dialogues: [],
  name: 'smart-factory',
};

const pipeline = createGLTFPipeline({ format: 'glb' });
console.log('Compiling massive 50,000 machine mesh layout...');

try {
  const result = pipeline.compile(comp, 'test-token') as any;
  console.log('Compiled GLB Size: ', Math.round(result.stats.fileSizeBytes / 1024 / 1024), 'MB');
  console.log('Memory after: ', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
  console.log('OOM Validation: SUCCESS');
} catch (e) {
  console.error('FAILED TO COMPILE:', e);
  process.exit(1);
}
