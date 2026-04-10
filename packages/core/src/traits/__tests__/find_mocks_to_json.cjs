const fs = require('fs');
const path = require('path');
const d = 'packages/core/src/traits/__tests__';
let out = [];
fs.readdirSync(d)
  .filter((f) => f.endsWith('.ts'))
  .forEach((f) => {
    const c = fs.readFileSync(path.join(d, f), 'utf8');
    // Match any vi.mock('...')
    const rx = /vi\.mock\(['"](.*?)['"]/g;
    let m;
    while ((m = rx.exec(c)) !== null) {
      if (m[1].startsWith('.')) {
        out.push(m[1] + '   (in ' + f + ')');
      }
    }
  });
console.log('Writing to json');
fs.writeFileSync(
  'packages/core/src/traits/__tests__/mock_list.json',
  JSON.stringify(out, null, 2),
  'utf8'
);
