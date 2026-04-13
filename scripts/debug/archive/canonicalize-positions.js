const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        if (file.includes('node_modules') || file.includes('dist') || file.includes('out') || file.includes('build') || file.includes('coverage') || file.includes('.git')) return;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(fullPath));
        } else {
            if (file.endsWith('.holo') || file.endsWith('.hs') || file.endsWith('.ts') || file.endsWith('.md')) {
                results.push(fullPath);
            }
        }
    });
    return results;
}

const targetDir = 'C:/Users/Josep/Documents/GitHub/HoloScript/packages';
const files = walk(targetDir);

// Match `position: { x: 1, y: 2, z: 3 }` across multiple lines or single line
const regex = /position\s*:\s*\{\s*x\s*:\s*([^,]+?)\s*(?:,)?\s*y\s*:\s*([^,]+?)\s*(?:,)?\s*z\s*:\s*([^\}]+?)\s*\}/g;

let modifiedFiles = 0;
let modifiedOccurrences = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let fileModified = false;

    const newContent = content.replace(regex, (match, x, y, z) => {
        fileModified = true;
        modifiedOccurrences++;
        return `position: [${x.trim()}, ${y.trim()}, ${z.trim()}]`;
    });

    if (fileModified) {
        fs.writeFileSync(file, newContent, 'utf8');
        modifiedFiles++;
        console.log(`Updated: ${file}`);
    }
}

console.log(`Fixed ${modifiedOccurrences} occurrences in ${modifiedFiles} files.`);
