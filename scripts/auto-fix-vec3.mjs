import fs from 'fs';

const log = fs.readFileSync('packages/engine/tsc_errors.txt', 'utf16le');
const lines = log.split('\n');

const errorsByFile = {};

lines.forEach(line => {
  const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)/);
  if (!match) return;
  const [_, file, lnum, col, tsCode, msg] = match;
  if (!errorsByFile[file]) errorsByFile[file] = [];
  errorsByFile[file].push({ line: parseInt(lnum) - 1, col: parseInt(col) - 1, msg, tsCode });
});

for (const [file, errs] of Object.entries(errorsByFile)) {
  const path = `packages/engine/${file}`;
  let content;
  try {
    content = fs.readFileSync(path, 'utf8');
  } catch(e) {
    continue;
  }
  const fileLines = content.split('\n');
  let changed = false;

  // We want to process backwards to not mess up columns if we edit lines, but since we edit line by line entirely it doesn't matter too much.
  // Wait, multiple errors on the same line. Let's gather errors per line.
  const lineErrs = {};
  errs.forEach(e => {
    if (!lineErrs[e.line]) lineErrs[e.line] = [];
    lineErrs[e.line].push(e);
  });

  for (const [lnumStr, lineErrors] of Object.entries(lineErrs)) {
    const lnum = parseInt(lnumStr);
    let l = fileLines[lnum];
    
    // Check if it's the property x,y,z does not exist on tuple
    const hasX = lineErrors.some(e => e.msg.includes("Property 'x' does not exist"));
    const hasY = lineErrors.some(e => e.msg.includes("Property 'y' does not exist"));
    const hasZ = lineErrors.some(e => e.msg.includes("Property 'z' does not exist"));

    const hasObjectAssign = lineErrors.some(e => e.msg.includes("is not assignable to type '[number, number, number]'") || e.msg.includes("Object literal may only specify"));
    
    if (hasObjectAssign) {
      // Replace {x: ..., y: ..., z: ...} with [..., ..., ...]
      const orig = l;
      l = l.replace(/\{\s*x:\s*([^,]+),\s*y:\s*([^,]+),\s*z:\s*([^}]+)\s*\}/g, '[$1, $2, $3]');
      if (orig !== l) changed = true;
    } 
    
    if (hasX || hasY || hasZ) {
      // It's safer to just replace .x -> [0], .y -> [1], .z -> [2] for the specific error columns if possible, but regex is easier.
      // We will match `.x` that is followed by anything except letters.
      const orig = l;
      if (hasX) l = l.replace(/\.x\b/g, '[0]');
      if (hasY) l = l.replace(/\.y\b/g, '[1]');
      if (hasZ) l = l.replace(/\.z\b/g, '[2]');
      if (orig !== l) changed = true;
    }

    // Assignability to parameter of type 'Vec3' but arg is tuple
    const hasArgTypeMismatch = lineErrors.some(e => e.msg.includes("Argument of type '[number, number, number]' is not assignable to parameter of type 'Vec3'") || e.msg.includes("is not assignable to parameter of type '{ x: number; y: number; z: number; }'"));
    // Not easily fixable by simple regex on same line because we don't know the method. 
    // We will leave these for manual fixing.

    // Also "is missing the following properties from type 'IVector3'"
    const hasIVector3 = lineErrors.some(e => e.msg.includes("missing the following properties from type 'IVector3'"));
    // same, manual.

    fileLines[lnum] = l;
  }

  if (changed) {
    fs.writeFileSync(path, fileLines.join('\n'));
    console.log(`Patched ${path}`);
  }
}
