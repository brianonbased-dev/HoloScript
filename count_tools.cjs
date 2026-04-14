const fs = require('fs');
const path = require('path');
function getFiles(dir){
  let files = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    if(fs.statSync(full).isDirectory()) files = files.concat(getFiles(full));
    else if(file.endsWith('.ts')) files.push(full);
  });
  return files;
}
const files = getFiles('./packages/mcp-server/src');
let count = 0;
let names = new Set();
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const regex = /name:\s*['"]([^'"]+)['"]/g;
  let match;
  while((match = regex.exec(content)) !== null) {
    if(!names.has(match[1])) {
      names.add(match[1]);
      count++;
    }
  }
});
const validNames = Array.from(names).filter(n => /^[a-zA-Z0-9_-]+$/.test(n));
console.log('Total unique tool names matched in source code:', validNames.length);
console.log(validNames.join(', '));
