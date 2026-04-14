import fs from 'fs';

const filePath = 'c:/Users/josep/Documents/GitHub/HoloScript/packages/engine/src/runtime/HoloScriptPlusRuntime.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Remove all @ts-expect-error - TS2339 structural type mismatch and the line after it
// Wait, no, just the comment line.
content = content.replace(/\s*\/\/ @ts-expect-error - TS2339 structural type mismatch/g, "");

fs.writeFileSync(filePath, content);
console.log("Removed all structural type mismatch markers from HoloScriptPlusRuntime.ts");
