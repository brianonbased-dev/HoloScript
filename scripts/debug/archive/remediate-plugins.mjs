import fs from 'fs';
import path from 'path';

console.log('[Ghost Remediation] Starting global wiring cycle...');

const pluginsDir = path.resolve('packages/plugins');
const corePkgPath = path.resolve('packages/core/package.json');
const traitsIndexPath = path.resolve('packages/core/src/traits/index.ts');
const registryPath = path.resolve('packages/core/src/traits/trait-registry.json');
const scenariosIdxPath = path.resolve('packages/studio/src/lib/scenarios/index.ts');

const corePkg = JSON.parse(fs.readFileSync(corePkgPath, 'utf8').replace(/^\uFEFF/, ''));
let traitsIndex = fs.readFileSync(traitsIndexPath, 'utf8');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, ''));

const pluginFolders = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory());

let injectedCount = 0;

for (const folder of pluginFolders) {
  const pkgFile = path.join(pluginsDir, folder, 'package.json');
  if (!fs.existsSync(pkgFile)) continue;
  
  const pkgData = JSON.parse(fs.readFileSync(pkgFile, 'utf8').replace(/^\uFEFF/, ''));
  const pkgName = pkgData.name;
  
  // 1. Dependency
  if (!corePkg.dependencies[pkgName]) {
    corePkg.dependencies[pkgName] = 'workspace:*';
    injectedCount++;
  }
  
  // 2. Export
  const exportStmt = `export * from '${pkgName}';`;
  if (!traitsIndex.includes(exportStmt)) {
    traitsIndex += `\n${exportStmt}`;
  }
  
  // 3. Registry (Just a basic stub to show it in UI)
  const safeId = pkgName.replace('@holoscript/plugin-', '').replace('@holoscript/', '');
  if (!registry[safeId]) {
    registry[safeId] = {
      id: safeId,
      namespace: pkgName,
      category: 'domain-vertical',
      properties: [],
      compileHints: [],
      composable: [],
      conflicts: []
    };
  }
}

// Write back core updates
fs.writeFileSync(corePkgPath, JSON.stringify(corePkg, null, 2) + '\n');
fs.writeFileSync(traitsIndexPath, traitsIndex + '\n');
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 4) + '\n');
console.log(`[Ghost Remediation] Wired ${injectedCount} unregistered plugins into Core dependencies, traits/index, and registry.`);

// Studio Scenarios Generator
console.log('[Ghost Remediation] Generating Studio Scenario mappings...');
fs.mkdirSync(path.dirname(scenariosIdxPath), { recursive: true });
let scenariosIdx = `// Auto-generated Scenario Registry\n// Exposes 100+ isolated vertical simulators and scenes for the Universal POE\n\n`;

const studioRoot = path.resolve('packages/studio/src');
const crawlStr = (dir) => {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (item !== '__tests__' && item !== 'types') {
        crawlStr(fullPath);
      }
    } else if (stat.isFile() && fullPath.endsWith('.ts') && !fullPath.endsWith('.test.ts') && !fullPath.endsWith('index.ts') && !fullPath.endsWith('.d.ts')) {
      const relPath = fullPath.replace(studioRoot, '').replace(/\\/g, '/').replace('.ts', '').replace('.tsx', '');
      const exportName = item.replace('.ts', '').replace(/[^a-zA-Z0-9]/g, '_');
      scenariosIdx += `export * as ${exportName} from '..${relPath}';\n`;
    }
  }
};
crawlStr(studioRoot);

fs.writeFileSync(scenariosIdxPath, scenariosIdx);

// Engine Orphans
const engineIdxPath = path.resolve('packages/engine/src/index.ts');
let engineIdx = fs.readFileSync(engineIdxPath, 'utf8');
if (!engineIdx.includes('GaussianSplatExtractor')) {
  engineIdx += `\nexport * from './gpu/GaussianSplatExtractor';`;
}
if (!engineIdx.includes('TetGenWasmMesher')) {
  engineIdx += `\nexport * from './simulation/TetGenWasmMesher';`;
}
if (!engineIdx.includes('HoloScriptPlusRuntime')) {
  engineIdx += `\nexport * from './runtime/HoloScriptPlusRuntime';`;
  engineIdx += `\nexport * from './runtime/InstancedRenderer';`;
  engineIdx += `\nexport * from './runtime/AssetStreamer';`;
}
fs.writeFileSync(engineIdxPath, engineIdx);

// Absorb Service Orphans
const absorbIdxPath = path.resolve('packages/absorb-service/src/index.ts');
let absorbIdx = fs.readFileSync(absorbIdxPath, 'utf8');
if (!absorbIdx.includes('SelfImprovementPipeline')) {
  absorbIdx += `\nexport * from './self-improvement/SelfImprovementPipeline';`;
  absorbIdx += `\nexport * from './self-improvement/GRPORewardOrchestrator';`;
}
fs.writeFileSync(absorbIdxPath, absorbIdx);

console.log('[Ghost Remediation] Engine, Studio, and Absorb orphan exposures completed.');
