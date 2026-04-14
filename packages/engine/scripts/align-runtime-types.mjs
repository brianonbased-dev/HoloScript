import fs from 'fs';

const filePath = 'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src/runtime/HoloScriptPlusRuntime.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Update type names
content = content.replace(/HSPlusExpression/g, "HoloExpression");
content = content.replace(/HSPlusStatement/g, "HoloStatement");
content = content.replace(/HSPlusProgram/g, "HoloProgram");
content = content.replace(/HSPlusType/g, "HoloType");

fs.writeFileSync(filePath, content);
console.log("Updated HoloScript+ type names in HoloScriptPlusRuntime.ts");
