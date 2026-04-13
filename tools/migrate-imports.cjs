const { Project } = require('ts-morph');
const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '..', 'migration_map.json');
const migrationMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const meshSet = new Set(migrationMap.mesh);
const platformSet = new Set(migrationMap.platform);

const root = path.join(__dirname, '..');

const packagesToMigrate = [
    'studio',
    'studio-ui',
    'studio-vr',
    'studio-bridge',
    'r3f-renderer',
    'marketplace-web',
    'collab-server',
    'create-holoscript-app',
    'playground',
    'holoscript',
    'preview-component'
];

let modifications = 0;
let missedSymbols = new Set();
let scannedCoreImports = 0;

packagesToMigrate.forEach(pkg => {
    const pkgPath = path.join(root, 'packages', pkg);
    if (!fs.existsSync(pkgPath)) return;

    console.log(`Processing package: ${pkg}`);
    const project = new Project();
    project.addSourceFilesAtPaths(`${pkgPath}/**/*.ts`);
    project.addSourceFilesAtPaths(`${pkgPath}/**/*.tsx`);

    for (const sourceFile of project.getSourceFiles()) {
        if (sourceFile.getFilePath().includes('node_modules')) continue;
        if (sourceFile.getFilePath().includes('dist')) continue;

        const imports = sourceFile.getImportDeclarations();
        let hasChanges = false;

        for (const imp of imports) {
            if (imp.getModuleSpecifierValue() === '@holoscript/core') {
                scannedCoreImports++;
                const namedImports = imp.getNamedImports();
                if (namedImports.length === 0) continue;

                const coreKeeps = [];
                const meshMoves = [];
                const platformMoves = [];

                for (const named of namedImports) {
                    const nameNode = named.getNameNode();
                    const name = nameNode ? nameNode.getText() : null;
                    const emitNodetext = named.getText();

                    if (!name) continue;

                    if (platformSet.has(name)) {
                        platformMoves.push(emitNodetext);
                    } else if (meshSet.has(name)) {
                        meshMoves.push(emitNodetext);
                    } else {
                        coreKeeps.push(emitNodetext);
                        missedSymbols.add(name);
                    }
                }

                if (meshMoves.length > 0 || platformMoves.length > 0) {
                    hasChanges = true;
                    
                    if (coreKeeps.length > 0) {
                        imp.replaceWithText(`import { ${coreKeeps.join(', ')} } from '@holoscript/core';`);
                    } else {
                        imp.remove();
                    }

                    if (platformMoves.length > 0) {
                        sourceFile.addImportDeclaration({
                            moduleSpecifier: '@holoscript/platform',
                            namedImports: platformMoves
                        });
                    }
                    
                    if (meshMoves.length > 0) {
                        sourceFile.addImportDeclaration({
                            moduleSpecifier: '@holoscript/mesh',
                            namedImports: meshMoves
                        });
                    }
                }
            }
        }

        if (hasChanges) {
            sourceFile.saveSync();
            modifications++;
        }
    }
});

console.log(`Migration complete. Modified ${modifications} files.`);
console.log(`Total @holoscript/core imports found: ${scannedCoreImports}`);
const missedArray = Array.from(missedSymbols);
console.log(`Unique symbols kept in core: ${missedArray.length}. First 20: ${missedArray.slice(0, 20).join(', ')}`);
