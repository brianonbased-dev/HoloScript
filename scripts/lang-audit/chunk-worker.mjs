/**
 * Chunk worker for the BLAST 1/3 parse audit. Reads a JSON array of absolute
 * file paths from the file named in argv[2], parses each one via parse-one.mjs,
 * and writes ONE JSON line per file to stdout AS IT COMPLETES (not buffered
 * until the end) -- so if this process is killed mid-chunk by the orchestrator's
 * timeout (a file hangs), whatever lines were already flushed survive and the
 * orchestrator can identify exactly which file(s) in the chunk never got a
 * result, isolating them for a single-file retry instead of losing the whole
 * chunk's data.
 */
import fs from 'node:fs';
import { parseOneFile } from './parse-one.mjs';

const listPath = process.argv[2];
const files = JSON.parse(fs.readFileSync(listPath, 'utf-8'));

for (const file of files) {
  const result = await parseOneFile(file);
  process.stdout.write(JSON.stringify(result) + '\n');
}
