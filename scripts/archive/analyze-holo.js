const fs = require('fs');
const content = fs.readFileSync('codebase.holo', 'utf8');

const locRegex = /object "([^"]+)"[^\{]*\{[\s\S]*?loc: (\d+)/g;
const locMatches = [...content.matchAll(locRegex)];
const locs = locMatches.map(m => ({name: m[1], loc: parseInt(m[2], 10) })).sort((a,b) => b.loc - a.loc).slice(0, 15);

const edgesMatch = [...content.matchAll(/on_interact\("([^"]+)"\)/g)];
const edges = edgesMatch.reduce((acc, curr) => {
  acc[curr[1]] = (acc[curr[1]] || 0) + 1;
  return acc;
}, {});
const topEdges = Object.entries(edges).sort((a,b) => b[1] - a[1]).slice(0, 15);

console.log('--- Top 15 Largest Components (Lines of Code) ---');
console.table(locs);
console.log('\n--- Top 15 Most Coupled Components (on_interact Edges) ---');
console.table(topEdges.map(([name, count]) => ({ Component: name, IncomingEdges: count })));
