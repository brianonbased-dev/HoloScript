import fs from 'fs';
import path from 'path';

const TARGET_DIRS = [
  'c:/Users/josep/Documents/GitHub/HoloScript',
  'c:/Users/josep/Documents/GitHub/Hololand',
];

const EXTENSIONS = ['.hs', '.holo', '.hsplus'];

function findFiles(dir: string, fileList: string[] = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        findFiles(filePath, fileList);
      }
    } else {
      if (EXTENSIONS.includes(path.extname(file))) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

async function runFixer() {
  console.log('Starting HoloScript Source Fixer...');
  const allFiles: string[] = [];
  for (const dir of TARGET_DIRS) {
    findFiles(dir, allFiles);
  }
  console.log(`Found ${allFiles.length} files to review.`);

  let fixedCount = 0;

  for (const file of allFiles) {
    try {
      // Detect encoding logic (basic)
      let buffer = fs.readFileSync(file);
      let content = '';

      // Check for UTF-16LE BOM
      if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        content = buffer.toString('utf16le');
      } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        content = buffer.toString('utf16le'); // Node mostly handles Big Endian if specified, but commonly LE on Windows
      } else {
        content = buffer.toString('utf8');
      }

      // Skip if looks like binary (lots of nulls)
      if (content.split('\u0000').length > 10) {
        console.log(`Skipping binary file: ${path.basename(file)}`);
        continue;
      }

      const fixed = fixContent(content, file);
      if (fixed !== content) {
        fs.writeFileSync(file, fixed, 'utf8'); // Save as standard UTF-8
        console.log(`Fixed: ${path.basename(file)}`);
        fixedCount++;
      }
    } catch (e) {
      console.log(`Error processing ${file}: ${e.message}`);
    }
  }
  console.log(`Fixer complete. Modified ${fixedCount} files.`);
}

function fixContent(code: string, filePath: string): string {
  let original = code;

  // 1. Remove Top-Level Module Wrappers
  if (code.trim().startsWith('module.exports = {')) {
    code = code.replace(/module\.exports\s*=\s*{/, '');
    code = code.replace(/}\s*$/, '');
  }

  // 2. Remove Top-Level Commas and Object Delimiters
  // Replace "}, newline" with "}"
  code = code.replace(/}\s*,(\s*\n)/gm, '}$1');

  // 3. Quote Arrow Functions (Enhanced)
  // catch: key: (a,b) => { ... }
  code = code.replace(/(\w+):\s*(\([^)]*\)\s*=>\s*{[\s\S]*?})(,?)/gm, (match, key, func, comma) => {
    if (func.trim().startsWith('"')) return match;
    const escaped = func.replace(/"/g, '\\"').replace(/\n\s*/g, ' ');
    return `${key}: "${escaped}"${comma}`;
  });
  // catch: key: () => expr
  code = code.replace(/(\w+):\s*(\(\)\s*=>\s*[^,{}\n]+)(,?)/g, (match, key, func, comma) => {
    if (func.trim().startsWith('"')) return match;
    return `${key}: "${func.replace(/"/g, '\\"')}"${comma}`;
  });

  // 4. Quote Logical Expressions
  const expressionKeys = ['condition', 'trigger', 'onDamage', 'onSensory', 'onTimeout'];
  expressionKeys.forEach((key) => {
    const regex = new RegExp(`(${key}:\\s*)([^{}\\n",]+)(,?)`, 'g');
    code = code.replace(regex, (match, prefix, val, suffix) => {
      val = val.trim();
      if (
        val === 'true' ||
        val === 'false' ||
        !isNaN(Number(val)) ||
        val.startsWith('"') ||
        val.startsWith('{') ||
        val.startsWith('[')
      )
        return match;
      // Don't quote if it looks like a variable reference in a loop (simple identifier)
      if (/^[a-zA-Z_]\w*$/.test(val)) return match;
      return `${prefix}"${val.replace(/"/g, '\\"')}"${suffix}`;
    });
  });

  // 5. Basic conversion of "Natural Language" connection syntax (ai-agent.hs)
  // connect A to B as "C"  ->  connection { from: "A", to: "B", type: "C" }
  code = code.replace(
    /connect\s+(\w+)\s+to\s+(\w+)\s+as\s+"([^"]+)"/g,
    'connection { from: "$1", to: "$2", type: "$3" }'
  );
  code = code.replace(/connect\s+(\w+)\s+to\s+(\w+)/g, 'connection { from: "$1", to: "$2" }');

  // 6. Fix "orb Name {" -> "object \"Name\" {" (Orb is not a standard keyword, likely object)
  code = code.replace(/\borb\s+(\w+)\s*{/g, 'object "$1" {');

  // 7. Fix "function Name() {" -> "function \"Name\" {" (if function is unsupported, treat as generic node)
  code = code.replace(/\bfunction\s+(\w+)\s*\([^)]*\)\s*:/g, 'function "$1" :'); // with return type
  code = code.replace(/\bfunction\s+(\w+)\s*\([^)]*\)\s*{/g, 'function "$1" {');

  // 8. Remove trailing commas before closing braces/brackets
  code = code.replace(/,(\s*[}\]])/g, '$1');

  return code;
}

runFixer();
