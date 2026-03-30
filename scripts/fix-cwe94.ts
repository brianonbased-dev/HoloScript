import * as fs from 'fs';
import * as path from 'path';

const COMPILERS_DIR = 'C:/Users/josep/Documents/GitHub/HoloScript/packages/core/src/compiler';
const files = fs.readdirSync(COMPILERS_DIR).filter((f) => f.endsWith('Compiler.ts'));

for (const file of files) {
  if (
    [
      'NodeServiceCompiler.ts',
      'NFTMarketplaceCompiler.ts',
      'R3FCompiler.ts',
      'CompilerBase.ts',
    ].includes(file)
  )
    continue;

  const fullPath = path.join(COMPILERS_DIR, file);
  let content = fs.readFileSync(fullPath, 'utf8');

  let modified = false;

  const regex1 = /\$\{([a-zA-Z0-9_]+)\.(name|id|key|path|event|method)\}/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, (match, p1, p2) => {
      return `\${this.escapeStringValue(${p1}.${p2} as string, 'TypeScript')}`;
    });
    modified = true;
  }

  const regex2 = /\$\{([a-zA-Z0-9_]+)\.(name|id|key|path|event|method)\s+as\s+string\}/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, (match, p1, p2) => {
      return `\${this.escapeStringValue(${p1}.${p2} as string, 'TypeScript')}`;
    });
    modified = true;
  }

  // Some are like: `pw.name`
  // `prop.key`
  // Let's also look for `code_${obj.name}`

  if (modified) {
    fs.writeFileSync(fullPath, content);
    console.log(`Patched ${file}`);
  }
}
