const fs = require('fs');
const path = require('path');
const dir = './packages/absorb-service/src/mcp';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

files.forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  // Find exported arrays of tools
  const regex = /export\s+const\s+([a-zA-Z0-9_]+Tools)\s*(:\s*Tool\[\])?\s*=/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const arrayName = match[1];
    const expectedImports = ['codebaseTools', 'graphRagTools', 'absorbServiceTools', 'absorbTypescriptTools', 'oracleTools'];
    if (!expectedImports.includes(arrayName)) {
      console.log(`MISSING in mcp-server tools.ts: ${arrayName} from ${f}`);
      const start = content.indexOf(`${arrayName} `, content.indexOf(match[0]));
      const textToCount = content.slice(match.index);
      const toolsCount = (textToCount.match(/name:\s*['"][^'"]+['"]/g) || []).length;
      console.log(`  -> Contains approx ${toolsCount} tools`);
    }
  }
});
