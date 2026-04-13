import fs from 'fs';

const log = fs.readFileSync('tsc_errors_3.txt', 'utf16le');
const lines = log.split('\n');

const files = {};
lines.forEach(line => {
    const match = line.match(/^([\w/.-]+)\((\d+),(\d+)\):/);
    if (match) {
        let file = match[1];
        let num = parseInt(match[2]);
        if (!files[file]) files[file] = [];
        files[file].push(num);
    }
});

for (const file in files) {
    if (!fs.existsSync('packages/engine/' + file)) continue;
    const content = fs.readFileSync('packages/engine/' + file, 'utf8').split('\n');
    console.log(`\n--- ${file} ---`);
    const uniqueLines = [...new Set(files[file])].sort((a,b) => a-b);
    uniqueLines.forEach(l => {
        console.log(`L${l}: ${content[l-1]}`);
    });
}
