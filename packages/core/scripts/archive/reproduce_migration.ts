import { createRuntime } from './src/runtime/HoloScriptPlusRuntime';
import { HoloScriptPlusParser } from './src/HoloScriptPlusParser';

async function run() {
  const parser = new HoloScriptPlusParser();
  const mockAST = {
    type: 'Program',
    body: [],
    root: { type: 'scene', traits: new Map(), directives: [], children: [], properties: {} },
  } as any;
  const runtime = createRuntime(mockAST);

  console.log('--- SPAWNING V1 ---');
  const codeV1 = `
    @version 1
    orb {
      color: "#ff0000"
      oldProp: "val"
    }
  `;
  const astV1 = parser.parse(codeV1);
  runtime.registerTemplate('test', astV1.root);
  const nodeV1 = runtime.spawnTemplate('test', { x: 0, y: 0, z: 0 });
  const instance = runtime.findInstanceByNode(nodeV1);

  if (!instance) throw new Error('Instance not found');

  // Simulate runtime modification
  console.log('--- MODIFYING PROPERTY ---');
  instance.node.properties!.oldProp = 'modified';

  console.log('Properties before hot-reload:', JSON.stringify(instance.node.properties));

  console.log('--- HOT-RELOAD TO V2 ---');
  const codeV2 = `
    @version 2
    migrations {
      from 1 {
        renameProperty("oldProp", "newProp");
        props.hotReloaded = true;
        props.size = 2.0;
      }
    }
    orb {
      color: "#ffffff"
      size: 1.0
    }
  `;
  const astV2 = parser.parse(codeV2);

  // Trigger hot-reload
  runtime.registerTemplate('test', astV2.root);

  console.log('Properties after hot-reload:', JSON.stringify(instance.node.properties));
  console.log('Instance properties getter:', JSON.stringify(instance.properties));

  if (instance.properties.size === 2.0) {
    console.log('SUCCESS: Property migrated correctly!');
  } else {
    console.log('FAILURE: Property migration failed, size is:', instance.properties.size);
  }
}

run().catch(console.error);
