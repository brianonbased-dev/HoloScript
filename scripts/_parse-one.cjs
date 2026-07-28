// Usage: node scripts/_parse-one.cjs <parser.cjs> <file.holo>
const { parseHolo } = require(process.argv[2]);
const fs = require('fs');
const src = fs.readFileSync(process.argv[3], 'utf8');
const r = parseHolo(src);
if (r.success) {
  process.stdout.write('PASS\n');
} else {
  const err = r.errors?.[0];
  const msg = err
    ? JSON.stringify({
        code: err.code,
        msg: (err.message || '').substring(0, 200).replace(/\n/g, ' '),
        line: err.line,
      })
    : 'unknown';
  process.stdout.write('FAIL:' + msg + '\n');
}
