const fs = require('fs');
const path = require('path');
const dir = './packages/mcp-server/src';
const files = fs.readdirSync(dir).filter(f => f.endsWith('-tools.ts') || f === 'tools.ts' || f === 'brittney-lite.ts' || f === 'a2a.ts');
const toolsTsCode = fs.readFileSync(path.join(dir, 'tools.ts'), 'utf8');

files.forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  // Find exported arrays of tools
  const regex = /export\s+const\s+([a-zA-Z0-9_]+Tools)\s*(:\s*Tool\[\])?\s*=/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const arrayName = match[1];
    if (arrayName !== 'tools') {
      if (!toolsTsCode.includes(`...${arrayName}`)) {
        console.log(`MISSING in tools.ts: ${arrayName} from ${f}`);
        // Count how many tools are in this missing array
        const start = content.indexOf(`${arrayName} `, content.indexOf(match[0]));
        const textToCount = content.slice(match.index);
        const toolsCount = (textToCount.match(/name:\s*['"][^'"]+['"]/g) || []).length;
        console.log(`  -> Contains approx ${toolsCount} tools`);
      }
    }
  }
});
