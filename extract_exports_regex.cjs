const fs = require('fs');
const path = require('path');

function findExportsInDir(dir, exportsSet = new Set()) {
    if (!fs.existsSync(dir)) return exportsSet;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            findExportsInDir(fullPath, exportsSet);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Match `export class X`, `export interface X`, `export type X`, `export function X`, `export const X`
            const regexes = [
                /export\s+(class|interface|type|function|const|let|var)\s+([A-Za-z0-9_]+)/g,
                /export\s*\{\s*([^}]+)\s*\}/g
            ];
            
            let match;
            while ((match = regexes[0].exec(content)) !== null) {
                exportsSet.add(match[2]);
            }
            while ((match = regexes[1].exec(content)) !== null) {
                // `export { A, B as C }`
                const parts = match[1].split(',');
                for (let part of parts) {
                    part = part.trim();
                    if (!part) continue;
                    if (part.includes(' as ')) {
                        exportsSet.add(part.split(' as ')[1].trim());
                    } else {
                        // ignore default and type modifiers directly here if they exist, roughly grab name
                        part = part.replace(/^type\s+/, '').trim();
                        exportsSet.add(part);
                    }
                }
            }
        }
    }
    return exportsSet;
}

const root = path.join(__dirname, 'packages');
const meshExports = findExportsInDir(path.join(root, 'mesh', 'src'));
const platformExports = findExportsInDir(path.join(root, 'platform', 'src'));
// Also capture engine exports if possible, they've been decoupled for a while
const engineExports = findExportsInDir(path.join(root, 'engine', 'src'));

const mapPath = path.join(__dirname, 'migration_map.json');
fs.writeFileSync(mapPath, JSON.stringify({
    mesh: Array.from(meshExports),
    platform: Array.from(platformExports),
    engine: Array.from(engineExports)
}, null, 2));

console.log(`Saved to ${mapPath}`);
console.log(`Mesh: ${meshExports.size}, Platform: ${platformExports.size}, Engine: ${engineExports.size}`);
