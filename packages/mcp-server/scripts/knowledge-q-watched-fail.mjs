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

const mode = process.argv[2] || 'green';
const a = search('junction');
const b = search('zzzz-nonsense-query-nothing-matches');
const identical = JSON.stringify(a) === JSON.stringify(b);

if (mode === 'red') {
  if (identical) {
    console.log('RED expected: q still ignored');
    process.exit(0);
  }
  console.error('watched-fail: expected identical dumps, got distinct', { a, b });
  process.exit(1);
}

if (identical) {
  console.error('green failed: hit and miss still identical', { a, b });
  process.exit(1);
}
console.log('GREEN: junction and nonsense queries diverge', { a, b });
process.exit(0);
