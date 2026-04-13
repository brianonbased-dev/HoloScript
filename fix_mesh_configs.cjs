const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname);
const meshPkgPath = path.join(rootDir, 'packages', 'mesh', 'package.json');
const meshTsupPath = path.join(rootDir, 'packages', 'mesh', 'tsup.config.ts');

// Fix mesh/package.json
if (fs.existsSync(meshPkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(meshPkgPath, 'utf8'));
  pkg.exports = {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  };
  delete pkg.bin;
  pkg.repository.directory = "packages/mesh";
  // Keep dependencies for now, maybe we can clean them later.
  fs.writeFileSync(meshPkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  console.log('Fixed packages/mesh/package.json');
}

// Fix mesh/tsup.config.ts
if (fs.existsSync(meshTsupPath)) {
  let content = fs.readFileSync(meshTsupPath, 'utf8');
  // replace entry map
  content = content.replace(/entry: \{[\s\S]*?\},/, "entry: { 'index': 'src/index.ts' },");
  fs.writeFileSync(meshTsupPath, content, 'utf8');
  console.log('Fixed packages/mesh/tsup.config.ts');
}

