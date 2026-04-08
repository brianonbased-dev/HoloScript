const fs = require('fs');
const path = require('path');
const d = 'packages/core/src/traits/__tests__';

const mappings = [
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/\.\.\/choreography\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/choreography/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/choreography\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/choreography/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/runtime\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/runtime/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/physics\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/physics/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/animation\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/animation/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/utils\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/utils/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/network\/(.*?)['"]/g, rep: "vi.mock('@holoscript/engine/network/$1'" },
  { rx: /vi\.mock\(['"]\.\.\/\.\.\/logger['"]/g, rep: "vi.mock('@holoscript/engine/logger'" }
];

let replacedFiles = 0;
fs.readdirSync(d).filter(f=>f.endsWith('.ts')).forEach(f => {
  const p = path.join(d, f);
  let c = fs.readFileSync(p, 'utf8');
  let changed = false;
  mappings.forEach(m => {
    if (m.rx.test(c)) {
      c = c.replace(m.rx, m.rep);
      changed = true;
    }
  });
  if (changed) {
    fs.writeFileSync(p, c, 'utf8');
    console.log('Fixed', f);
    replacedFiles++;
  }
});
console.log('Replaced in ' + replacedFiles + ' files.');
