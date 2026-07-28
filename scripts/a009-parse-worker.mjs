/**
 * Worker: parses a batch of files then exits, avoiding heap accumulation.
 * Args: list of file paths via stdin (newline-separated)
 * Output: JSON lines { file, ok, error? }
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);

const core = require(join(ROOT, 'packages/core/dist/parser.cjs'));
const { parseHolo, parse, HoloScriptPlusParser } = core;

function normalizeInputPath(filepath) {
  if (process.platform === 'win32') {
    const msys = filepath.match(/^\/([a-zA-Z])\/(.*)$/);
    if (msys) {
      return `${msys[1].toUpperCase()}:/${msys[2]}`;
    }
    const wsl = filepath.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
    if (wsl) {
      return `${wsl[1].toUpperCase()}:/${wsl[2]}`;
    }
  }
  return filepath;
}

const listArgIndex = process.argv.indexOf('--list');
const input =
  listArgIndex >= 0
    ? readFileSync(normalizeInputPath(process.argv[listArgIndex + 1]), 'utf8')
    : readFileSync(0, 'utf8');
const files = input
  .trim()
  .split(/\r\n|\n|\r/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const filepath of files) {
  const ext = filepath.split('.').pop();
  try {
    const code = readFileSync(normalizeInputPath(filepath), 'utf8');
    let result;
    if (ext === 'holo') result = parseHolo(code);
    else if (ext === 'hsplus') {
      const p = new HoloScriptPlusParser();
      result = p.parse(code);
    } else result = parse(code);
    // Parsers report most failures via { success: false } WITHOUT throwing —
    // counting only thrown errors silently passes broken examples.
    if (result && result.success === false) {
      const first = (result.errors || [])[0];
      process.stdout.write(
        JSON.stringify({
          file: filepath,
          ok: false,
          error: ((first && first.message) || 'parse reported success: false').slice(0, 240),
        }) + '\n'
      );
    } else {
      process.stdout.write(JSON.stringify({ file: filepath, ok: true }) + '\n');
    }
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ file: filepath, ok: false, error: e.message.split('\n')[0].slice(0, 240) }) +
        '\n'
    );
  }
}
