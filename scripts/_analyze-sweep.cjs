const r = JSON.parse(require('fs').readFileSync('.bench-logs/dogfood/parse-sweep-results.json','utf8'));
const timeouts = r.results.filter(x => x.result === 'TIMEOUT');
console.log('TIMEOUT files:', timeouts.map(x => x.file));

const errs = {};
r.results.filter(x => x.result === 'FAIL').forEach(x => {
  let e = x.error || 'unknown';
  // strip JSON, just extract msg
  try {
    const j = JSON.parse(e);
    e = j.msg || e;
  } catch(_) {}
  errs[e] = (errs[e] || 0) + 1;
});

console.log('\nError frequency:');
Object.entries(errs).sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([k,v]) => console.log(v, k.substring(0, 100)));
