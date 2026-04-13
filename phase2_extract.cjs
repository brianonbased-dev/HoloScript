const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname);
const coreSrc = path.join(rootDir, 'packages', 'core', 'src');
const meshSrc = path.join(rootDir, 'packages', 'mesh', 'src');

const meshDirs = [
  'network',
  'multiplayer',
  'social',
  'messaging',
  'collaboration',
  'consensus',
  'sync',
  'crdt'
];

console.log('Initiating Phase 2 Mesh Extraction...');

// Fix package.json for mesh
const meshPkgPath = path.join(rootDir, 'packages', 'mesh', 'package.json');
if (fs.existsSync(meshPkgPath)) {
  const meshPkg = JSON.parse(fs.readFileSync(meshPkgPath, 'utf8'));
  meshPkg.name = '@holoscript/mesh';
  meshPkg.dependencies = meshPkg.dependencies || {};
  meshPkg.dependencies['@holoscript/core-types'] = 'workspace:*';
  if (meshPkg.peerDependencies) delete meshPkg.peerDependencies['@holoscript/engine'];
  if (meshPkg.peerDependencies) delete meshPkg.peerDependencies['@holoscript/framework'];
  fs.writeFileSync(meshPkgPath, JSON.stringify(meshPkg, null, 2), 'utf8');
}

// 1. Move the subdirectories
for (const dir of meshDirs) {
  const srcPath = path.join(coreSrc, dir);
  const destPath = path.join(meshSrc, dir);
  
  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
    console.log(`✅ MOVED: ${dir}`);
  }
}

// 2. Generate mesh/index.ts
let indexContent = '/**\n * @holoscript/mesh public API\n */\n\n';
for (const dir of meshDirs) {
  const indexPath = path.join(meshSrc, dir, 'index.ts');
  if (fs.existsSync(indexPath)) {
    indexContent += `export * from './${dir}';\n`;
  } else {
    // If no explicit index.ts exists, we might need to export the TS files manually,
    // but typically Holoscript domains have an index.ts
  }
}
fs.writeFileSync(path.join(meshSrc, 'index.ts'), indexContent, 'utf8');

// 3. Update paths everywhere in core that imported from the moved domains
function processCoreFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir);
  let changed = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      changed += processCoreFiles(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;

      for (const domain of meshDirs) {
        const regex1 = new RegExp(`from '(\\.?\\.\\/)+${domain}'`, 'g');
        const regex2 = new RegExp(`from '(\\.?\\.\\/)+${domain}\\/([^']+)'`, 'g');
        content = content.replace(regex1, `from '@holoscript/mesh/${domain}'`);
        content = content.replace(regex2, (match, p1, p2) => `from '@holoscript/mesh/${domain}/${p2}'`);
      }

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`✅ REWRITTEN: ${path.relative(coreSrc, fullPath)}`);
        changed++;
      }
    }
  }
  return changed;
}

const numChanged = processCoreFiles(coreSrc);
console.log(`Rewrote ${numChanged} files in core to use @holoscript/mesh`);

// 4. Update core/src/index.ts to re-export from mesh
const coreIndex = path.join(coreSrc, 'index.ts');
if (fs.existsSync(coreIndex)) {
  let content = fs.readFileSync(coreIndex, 'utf8');
  for (const domain of meshDirs) {
    content = content.replace(new RegExp(`from '\\.\\/${domain}';`, 'g'), `from '@holoscript/mesh/${domain}';`);
    content = content.replace(new RegExp(`from '\\.\\/${domain}\\/([^']+)'`, 'g'), `from '@holoscript/mesh/${domain}/$1'`);
  }
  fs.writeFileSync(coreIndex, content, 'utf8');
  console.log(`✅ REWRITTEN: core/src/index.ts`);
}

console.log('\nPhase 2 Mesh Extraction Initialization Complete!');
