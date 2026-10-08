/**
 * Programs the Studio server runs must exist in the image that serves requests.
 *
 * Project import (app/api/workspace/import) runs `git clone` on the server, and so do
 * workspace provisioning, the existing-workspace importer and daemon jobs. The image
 * installed no git, so on Railway every import failed at its first step (founder report,
 * 2026-09-29: "Github login works but importing projects gives an error message").
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const studioRoot = resolve(__dirname, '../..');
const dockerfile = readFileSync(resolve(studioRoot, 'Dockerfile'), 'utf8');

/** Each build stage's text, keyed by its `AS <name>`. */
function stages(text: string): Map<string, { from: string; body: string }> {
  const out = new Map<string, { from: string; body: string }>();
  const parts = text.split(/^(?=FROM )/m).filter((p) => p.startsWith('FROM '));
  for (const part of parts) {
    const head = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i.exec(part);
    if (head?.[2]) out.set(head[2], { from: head[1], body: part });
  }
  return out;
}

/** Every apk package a stage installs, following `FROM <stage>` back to its parents. */
function apkPackages(all: Map<string, { from: string; body: string }>, name: string): Set<string> {
  const pkgs = new Set<string>();
  for (
    let stage = all.get(name), hops = 0;
    stage && hops < 10;
    stage = all.get(stage.from), hops += 1
  ) {
    for (const m of stage.body.matchAll(/^RUN apk add(?: --no-cache)? ([^\n&|;]+)/gm)) {
      for (const p of m[1].trim().split(/\s+/)) if (!p.startsWith('-')) pkgs.add(p);
    }
  }
  return pkgs;
}

describe('Studio image carries the programs its server runs', () => {
  const all = stages(dockerfile);

  it('the serving stage has git', () => {
    expect(all.has('runner')).toBe(true);
    expect(apkPackages(all, 'runner').has('git')).toBe(true);
  });

  it('the import route still runs git on the server, which is why the image needs it', () => {
    // P0b 2026-10-05: git now runs through the hardened helper lib/git/safeGit
    // (execFile('git', ...) lives there) instead of inline in the route, but the
    // server still shells out to git, so the serving image must carry it.
    const route = readFileSync(
      resolve(studioRoot, 'src/app/api/workspace/import/route.ts'),
      'utf8'
    );
    expect(route).toContain("from '@/lib/git/safeGit'");
    const safeGit = readFileSync(resolve(studioRoot, 'src/lib/git/safeGit.ts'), 'utf8');
    expect(safeGit).toMatch(/execFile\(\s*'git'/);
    expect(safeGit).toContain("execFileSync('git'");
  });
});
