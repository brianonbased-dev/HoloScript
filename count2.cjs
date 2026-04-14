const fs = require('fs');
const code = fs.readFileSync('./packages/mcp-server/src/tools.ts', 'utf8');
const match = code.match(/name:\s*['"][^'"]+['"]/g);
console.log('Tools listed explicitly inside tools.ts:', match ? match.length : 0);
