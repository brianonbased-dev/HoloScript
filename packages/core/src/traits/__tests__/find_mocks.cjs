const fs = require('fs');
const path = require('path');
const d = 'packages/core/src/traits/__tests__';
fs.readdirSync(d)
  .filter((f) => f.endsWith('.ts'))
  .forEach((f) => {
    const c = fs.readFileSync(path.join(d, f), 'utf8');
    // Match any vi.mock('...')
    const rx = /vi\.mock\(['"](.*?)['"]/g;
    let m;
    while ((m = rx.exec(c)) !== null) {
      if (m[1].startsWith('.')) {
        console.log(m[1] + '   (in ' + f + ')');
      }
    }
  });
