import { CodebaseScanner } from './engine/CodebaseScanner';

async function main() {
    console.log("Initializing CodebaseScanner...");
    const scanner = new CodebaseScanner();
    const result = await scanner.scan({
        rootDirs: ['C:\\Users\\Josep\\Documents\\GitHub\\HoloScript'],
        maxFiles: 800,
        exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**']
    });

    console.log("Scan Data Generated.");
    
    // Aggregate by package
    const packages = new Map();
    for (const file of result.files) {
        const pkgMatch = file.path.replace(/\\/g, '/').match(/packages\/([^/]+)/);
        if (pkgMatch) {
            const pkgName = pkgMatch[1];
            if (!packages.has(pkgName)) {
                packages.set(pkgName, { files: 0, exports: 0, classes: 0, interfaces: 0 });
            }
            const data = packages.get(pkgName);
            data.files++;
            if (file.symbols) {
                file.symbols.forEach((s: any) => {
                    if (s.kind === 'Export') data.exports++;
                    if (s.kind === 'Class') data.classes++;
                    if (s.kind === 'Interface') data.interfaces++;
                });
            }
        }
    }

    console.log("\n--- HoloScript Macro-Level Architecture ---");
    console.log(`Total Files Scanned: ${result.files.length}`);
    
    const sorted = Array.from(packages.entries()).sort((a,b) => b[1].files - a[1].files);
    console.log(JSON.stringify({ layers: sorted }, null, 2));
}

main().catch(console.error);
