function knowledgeEntryMatchesQuery(entry, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle || !entry) return false;
  const blob = [
    entry.id,
    entry.type,
    entry.content,
    entry.domain,
    entry.authorName,
    entry.authorId,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
  ].join('\n').toLowerCase();
  return blob.includes(needle);
}

const dump = [
  { id: 'W.old.1', type: 'gotcha', content: 'junction leak from a shared cwd pin' },
  { id: 'W.old.2', type: 'gotcha', content: 'unrelated lease expiry noise' },
];

function search(q) {
  return dump.filter((e) => knowledgeEntryMatchesQuery(e, q)).map((e) => e.id);
}

function dumpSearch(_q) {
  return dump.map((e) => e.id);
}

const mode = process.argv[2] || 'green';
const run = mode === 'red' ? dumpSearch : search;
const a = run('junction');
const b = run('zzzz-nonsense-query-nothing-matches');
const identical = JSON.stringify(a) === JSON.stringify(b);

if (identical) {
  console.error('q ignored: hit and miss identical', { a, b });
  process.exit(1);
}
console.log('q honored: queries diverge', { a, b });
process.exit(0);
