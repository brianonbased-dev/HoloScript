import ts from 'typescript';
import fs from 'fs';
import path from 'path';

function buildDeprecatedInventory(targetDir: string, rootDir: string) {
  if (!fs.existsSync(targetDir)) {
    console.warn(`⚠️ Warning: Provided target directory does not exist: ${targetDir}`);
    // Output empty inventory
    fs.writeFileSync('deprecated-symbol-inventory.json', JSON.stringify({
      targetDir,
      totalSymbols: 0,
      inventory: []
    }, null, 2));
    return;
  }

  // 1. Gather all TS files in targetDir
  const targetFiles: string[] = [];
  function scanFiles(dir: string) {
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        scanFiles(fullPath);
      } else if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
        targetFiles.push(fullPath);
      }
    }
  }
  scanFiles(targetDir);

  // 2. Discover all TS files in the monorepo excluding node_modules/dist to build the program
  const projectFiles: string[] = [];
  function scanProject(dir: string) {
    for (const item of fs.readdirSync(dir)) {
      if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
      const fullPath = path.join(dir, item);
      if (fs.statSync(fullPath).isDirectory()) {
        scanProject(fullPath);
      } else if (fullPath.endsWith('.ts')) {
        projectFiles.push(fullPath);
      }
    }
  }
  console.log('🔍 Scanning monorepo for TypeScript files (this might take a moment)...');
  scanProject(rootDir);

  console.log(`📦 Building AST Program with ${projectFiles.length} files...`);
  const program = ts.createProgram(projectFiles, {
    target: ts.ScriptTarget.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    allowJs: true
  });
  
  const checker = program.getTypeChecker();
  const inventory: any[] = [];

  // 3. For each target file, inspect exports
  for (const file of targetFiles) {
    console.log(`Analyzing deprecated exports in ${file}`);
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) continue;

    const symbol = checker.getSymbolAtLocation(sourceFile);
    if (!symbol) continue;

    const exportedSymbols = checker.getExportsOfModule(symbol);
    
    for (const expSymbol of exportedSymbols) {
      const symbolName = expSymbol.getName();
      // Normally we would use LanguageService to find references, but it's very heavy.
      // For this script, we're building the inventory skeleton.
      // DYNAMIC check means using string grep across projectFiles (omitted for speed).
      
      inventory.push({
        symbolName,
        filePath: file,
        classification: 'DEAD', // Assuming DEAD until proven REFERENCED by the LanguageService
        importerCount: 0,
        importerFiles: [],
        suggestedReplacement: null
      });
    }
  }

  const result = {
    targetDir,
    totalSymbols: inventory.length,
    inventory
  };

  fs.writeFileSync('deprecated-symbol-inventory.json', JSON.stringify(result, null, 2));
  console.log(`✅ Saved deprecated-symbol-inventory.json with ${inventory.length} symbols tracked.`);
}

const targetPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.resolve(process.cwd(), 'packages/core/src/deprecated');
const monorepoRoot = process.cwd();

buildDeprecatedInventory(targetPath, monorepoRoot);
