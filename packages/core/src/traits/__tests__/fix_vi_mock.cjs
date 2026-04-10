const fs = require('fs');
const files = [
  'packages/core/src/traits/__tests__/NPCAITrait.prod.test.ts',
  'packages/core/src/traits/__tests__/MultiplayerNPCScene.integration.test.ts',
  'packages/core/src/traits/__tests__/NPCAITrait.test.ts',
];
files.forEach((f) => {
  let c = fs.readFileSync(f, 'utf8');
  c = c.replace(/vi\.mock\('\.\.\/\.\.\/ai\/AIAdapter'/g, "vi.mock('@holoscript/framework/ai'");
  fs.writeFileSync(f, c);
  console.log('Fixed vi.mock in', f);
});
