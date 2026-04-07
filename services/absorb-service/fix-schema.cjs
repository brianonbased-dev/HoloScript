const fs = require('fs');
let s = fs.readFileSync('src/db/schema.ts', 'utf8');

s = s.replace(/\(t\)\s*=>\s*\[([\s\S]*?)\]/g, (match, inner) => {
  if (inner.includes('primaryKey')) return match;
  
  const elements = inner.split(/,\s*\n/).map(e => e.trim()).filter(Boolean);
  
  const objLines = elements.map((el, i) => {
    const nameMatch = el.match(/['"]([^'"]+)['"]/);
    const key = nameMatch ? nameMatch[1].replace(/[^a-zA-Z0-9_]/g, '') : `idx${i}`;
    let val = el;
    if (val.endsWith(',')) val = val.slice(0, -1);
    return `${key}: ${val}`;
  });
  
  return `(t) => ({\n    ${objLines.join(',\n    ')}\n  })`;
});

fs.writeFileSync('src/db/schema.ts', s);
