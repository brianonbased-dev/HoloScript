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

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        if (item === 'node_modules' || item === 'dist') continue;
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath, callback);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            callback(fullPath);
        }
    }
}

packagesToMigrate.forEach(pkg => {
    const pkgPath = path.join(root, 'packages', pkg);
    if (!fs.existsSync(pkgPath)) return;

    console.log(`Processing package: ${pkg}`);
    
    walkDir(pkgPath, (file) => {
        let content = fs.readFileSync(file, 'utf8');
        let hasChanges = false;

        // Matches import { A, B as C, type D } from '@holoscript/core';
        // We use a regex to capture single-line and multi-line imports
        const importRegex = /import\s+(?:type\s+)?\{([^}]*?)\}\s+from\s+['"]@holoscript\/core['"]/g;
        
        content = content.replace(importRegex, (match, inner) => {
            scannedCoreImports++;
            const items = inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
            
            const coreKeeps = [];
            const meshMoves = [];
            const platformMoves = [];

            for (const item of items) {
                // Ignore type prefix and aliases for resolution, but keep them for emit
                // e.g. "type NetworkManager" or "DeltaCompressor as DC"
                let rawName = item;
                if (rawName.startsWith('type ')) rawName = rawName.substring(5).trim();
                const asIndex = rawName.indexOf(' as ');
                if (asIndex !== -1) rawName = rawName.substring(0, asIndex).trim();

                if (platformSet.has(rawName)) {
                    platformMoves.push(item);
                } else if (meshSet.has(rawName)) {
                    meshMoves.push(item);
                } else {
                    coreKeeps.push(item);
                    missedSymbols.add(rawName);
                }
            }

            if (meshMoves.length > 0 || platformMoves.length > 0) {
                hasChanges = true;
                
                let replacements = [];
                
                if (coreKeeps.length > 0) {
                    // check if the original import had 'type' keyword globally
                    const isTypeImport = match.includes('import type {');
                    const prefix = isTypeImport ? 'import type' : 'import';
                    replacements.push(`${prefix} { ${coreKeeps.join(', ')} } from '@holoscript/core';`);
                }
                
                if (platformMoves.length > 0) {
                    const isTypeImport = platformMoves.every(m => m.startsWith('type ')) || match.includes('import type {');
                    const cleanMoves = isTypeImport ? platformMoves.map(m => m.replace(/^type\s+/, '')) : platformMoves;
                    const prefix = isTypeImport ? 'import type' : 'import';
                    replacements.push(`${prefix} { ${cleanMoves.join(', ')} } from '@holoscript/platform';`);
                }
                
                if (meshMoves.length > 0) {
                    const isTypeImport = meshMoves.every(m => m.startsWith('type ')) || match.includes('import type {');
                    const cleanMoves = isTypeImport ? meshMoves.map(m => m.replace(/^type\s+/, '')) : meshMoves;
                    const prefix = isTypeImport ? 'import type' : 'import';
                    replacements.push(`${prefix} { ${cleanMoves.join(', ')} } from '@holoscript/mesh';`);
                }
                
                return replacements.join('\n');
            }
            return match; // no change
        });

        if (hasChanges) {
            fs.writeFileSync(file, content, 'utf8');
            modifications++;
        }
    });
});

console.log(`Migration complete. Modified ${modifications} files.`);
console.log(`Total @holoscript/core imports found: ${scannedCoreImports}`);
const missedArray = Array.from(missedSymbols);
console.log(`Unique symbols kept in core: ${missedArray.length}. First 20: ${missedArray.slice(0, 20).join(', ')}`);
