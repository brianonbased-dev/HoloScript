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
  console.log("AST.body type:", typeof ast.body);
  console.log("Is ast an array?", Array.isArray(ast));
  console.log("ast.length:", ast.length);
  
  if (Array.isArray(ast)) {
    console.log("AST Items:", ast.length);
  } else if (ast.body) {
    console.log("AST.body length:", ast.body.length);
  }
}
test().catch(e => console.error(e));
