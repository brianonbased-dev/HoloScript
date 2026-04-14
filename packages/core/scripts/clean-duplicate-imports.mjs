import fs from 'fs';
import path from 'path';

const traitsDir = 'c:/Users/josep/Documents/GitHub/HoloScript/packages/core/src/traits';

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Find all import lines for Vector3
  const lines = content.split('\n');
  let newLines = [];
  let foundVector3 = false;

  for (let line of lines) {
    if (line.includes('import') && line.includes('Vector3')) {
      if (foundVector3) {
        console.log(`Removed duplicate import line from: ${filePath} - ${line}`);
        continue; // Skip duplicate
      }
      foundVector3 = true;
    }
    newLines.push(line);
  }

  content = newLines.join('\n');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = fs.readdirSync(traitsDir).filter(f => f.endsWith('.ts'));
files.forEach(file => {
  fixFile(path.join(traitsDir, file));
});

console.log('Finished cleaning duplicate imports.');
