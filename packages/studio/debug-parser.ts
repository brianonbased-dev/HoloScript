import { HoloScriptPlusParser } from '@holoscript/core';
import { V43Generator } from './src/core/ai/V43Generator';

async function test() {
  const g = new V43Generator();
  const raw = await g.generateHoloScript('Create a single object named DebugObj.');
  console.log("----------------------------");
  console.log("Raw Code:\n", raw);
  console.log("----------------------------");
  
  const parser = new HoloScriptPlusParser();
  const ast = parser.parse(raw);

  console.log("AST Keys:", Object.keys(ast));
  console.log("AST type:", typeof ast);
  console.log("Is ast an array?", Array.isArray(ast));

  if ('root' in ast) {
    console.log("AST.root type:", typeof ast.root);
    console.log("AST.root:", ast.root);
  }
}
test().catch(e => console.error(e));
