/**
 * Batch-migrate HoloScript compilers to extend CompilerBase with RBAC enforcement.
 * 
 * This script modifies each compiler file to:
 * 1. Import CompilerBase
 * 2. Extend CompilerBase
 * 3. Add compilerName property
 * 4. Update compile() signature to accept agentToken
 * 5. Add validateCompilerAccess() call
 */

const fs = require('fs');
const path = require('path');

const COMPILER_DIR = path.join(__dirname, '..', 'packages', 'core', 'src', 'compiler');

// Compilers that still need migration (old-style `compile(composition: HoloComposition)`)
const TARGETS = [
  'URDFCompiler.ts',
  'SDFCompiler.ts',
  'SCMCompiler.ts',
  'PlayCanvasCompiler.ts',
  'OpenXRCompiler.ts',
  'DTDLCompiler.ts',
  'USDPhysicsCompiler.ts',
  'AndroidXRCompiler.ts',
  'AndroidCompiler.ts',
  'IOSCompiler.ts',
  'ARCompiler.ts',
  'VRChatCompiler.ts',
  'WASMCompiler.ts',
  'VRRCompiler.ts',
  'MultiLayerCompiler.ts',
  'GLTFPipeline.ts',
  'NFTMarketplaceCompiler.ts',
];

let migratedCount = 0;
let skippedCount = 0;

for (const file of TARGETS) {
  const filePath = path.join(COMPILER_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP: ${file} — not found`);
    skippedCount++;
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const className = file.replace('.ts', '');

  // Skip if already extends CompilerBase
  if (content.includes('extends CompilerBase')) {
    console.log(`SKIP: ${file} — already migrated`);
    skippedCount++;
    continue;
  }

  // 1. Add import for CompilerBase (after last import line)
  const importLine = "import { CompilerBase } from './CompilerBase';";
  if (!content.includes(importLine)) {
    // Find the last import statement
    const importRegex = /^import .+$/gm;
    let lastImportIndex = 0;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      lastImportIndex = match.index + match[0].length;
    }
    if (lastImportIndex > 0) {
      content = content.slice(0, lastImportIndex) + '\n' + importLine + content.slice(lastImportIndex);
    }
  }

  // 2. Change `export class XxxCompiler {` → `export class XxxCompiler extends CompilerBase {`
  const classRegex = new RegExp(`export class ${className}\\s*\\{`);
  if (classRegex.test(content)) {
    content = content.replace(classRegex, `export class ${className} extends CompilerBase {`);
  } else {
    // Try without exact match
    const classRegex2 = new RegExp(`export class ${className}\\s*(?:implements\\s+\\w+\\s*)?\\{`);
    content = content.replace(classRegex2, `export class ${className} extends CompilerBase {`);
  }

  // 3. Add compilerName after the class opening brace
  if (!content.includes('compilerName')) {
    content = content.replace(
      `export class ${className} extends CompilerBase {`,
      `export class ${className} extends CompilerBase {\n  protected readonly compilerName = '${className}';`
    );
  }

  // 4. Add super() call in constructor if it exists
  if (content.includes('constructor(') && !content.includes('super()')) {
    // Find the constructor body opening brace
    const constructorMatch = content.match(/constructor\([^)]*\)\s*\{/);
    if (constructorMatch) {
      const idx = content.indexOf(constructorMatch[0]) + constructorMatch[0].length;
      content = content.slice(0, idx) + '\n    super();' + content.slice(idx);
    }
  }

  // 5. Update compile() signature — handle various return types
  // Pattern: compile(composition: HoloComposition): ReturnType {
  const compileRegex = /compile\(composition: HoloComposition\):\s*(\w+(?:\s*\|\s*\w+)*)\s*\{/;
  const compileMatch = content.match(compileRegex);
  if (compileMatch) {
    const returnType = compileMatch[1].trim();
    content = content.replace(
      compileRegex,
      `compile(composition: HoloComposition, agentToken: string, outputPath?: string): ${returnType} {`
    );
  }

  // 6. Add validateCompilerAccess after compile signature
  // Look for the new compile signature and add validation right after the opening brace
  const newCompileRegex = /compile\(composition: HoloComposition, agentToken: string, outputPath\?: string\):[^{]+\{/;
  const newCompileMatch = content.match(newCompileRegex);
  if (newCompileMatch && !content.includes('this.validateCompilerAccess(agentToken')) {
    const idx = content.indexOf(newCompileMatch[0]) + newCompileMatch[0].length;
    content = content.slice(0, idx) + '\n    this.validateCompilerAccess(agentToken, outputPath);' + content.slice(idx);
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`DONE: ${file} — migrated to CompilerBase`);
  migratedCount++;
}

console.log(`\n=== Migration complete: ${migratedCount} migrated, ${skippedCount} skipped ===`);
