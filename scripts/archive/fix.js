const fs = require('fs');
const path = 'scripts/generate-complete-uaa2-dataset.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\n/g, '\\n');
fs.writeFileSync(path, content);
console.log('Fixed generate-complete-uaa2-dataset.ts');
