/**
 * The MCP server must never run orchestrator job commands (task a4ed, P0).
 *
 * ci-public-worker.ts polled the orchestrator's /gpu/next for 'ci-public' jobs and ran each job's
 * `command` string through child_process.exec inside the Railway container, with every production
 * secret in its environment. Any orchestrator agent key could enqueue a ci-public job with a
 * free-text command; only a failing seat registration kept it idle, and it kept polling anyway.
 * It is deleted. This guard keeps a job runner from coming back quietly: no server source claims
 * jobs from the orchestrator's job queue. A worker that must run jobs belongs on a machine that
 * holds no keys, running a command it builds itself.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

function serverSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name === 'dist') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...serverSources(path));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(path);
  }
  return out;
}

describe('the MCP server runs no orchestrator jobs (a4ed)', () => {
  const files = serverSources(SRC);

  it('the scan sees the server source (it is not blind)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith('http-server.ts'))).toBe(true);
  });

  // A claim is a request to /gpu/next with its seat and lane query. Prose that describes the
  // protocol for workers elsewhere (world-render-tools.ts says "Worker claims via GET /gpu/next")
  // is fine. A source that names the queue AND can run shell commands is a job runner either way.
  it('no server source claims jobs from the orchestrator job queue, or runs what it names there', () => {
    const runners = files
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        const claims = /\/gpu\/next\?/.test(text);
        const runsShell = /\/gpu\/next\b/.test(text) && /['"](node:)?child_process['"]/.test(text);
        return claims || runsShell;
      })
      .map((f) => relative(SRC, f).split('\\').join('/'));
    expect(runners).toEqual([]);
  });
});
