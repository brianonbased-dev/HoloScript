import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverMachineProjects } from '../MachineCatalog';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf-8' }).trim();
}

function repo(dir: string, file = 'a.txt'): string {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 'codex@example.test');
  git(dir, 'config', 'user.name', 'Codex Test');
  fs.writeFileSync(path.join(dir, file), `${dir}\n`);
  git(dir, 'add', file);
  git(dir, 'commit', '-m', 'init');
  return dir;
}

describe('discoverMachineProjects', () => {
  it('groups copies with their project, names HoloRepo projects, and never enters dependency or credential folders', () => {
    const machine = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-catalog-'));
    const work = path.join(machine, 'holo-dev');
    const canonDir = path.join(work, 'ai-ecosystem', '.holorepo', 'git');
    fs.mkdirSync(canonDir, { recursive: true });

    // Canon bare repo whose HEAD names a branch that does not exist (holoscript.git on the laptop).
    const source = repo(path.join(machine, 'seed', 'holoscript'));
    git(machine, 'clone', '--bare', source, path.join(canonDir, 'holoscript.git'));
    git(path.join(canonDir, 'holoscript.git'), 'symbolic-ref', 'HEAD', 'refs/heads/master');

    const primary = path.join(work, 'HoloRepo', 'HoloScript');
    git(machine, 'clone', path.join(canonDir, 'holoscript.git'), primary);
    git(primary, 'checkout', 'main'); // as on the laptop: main checked out
    git(primary, 'worktree', 'add', path.join(work, '.scratch', 'wt-feature'), '-b', 'feature');
    // A straight clone of the canon repo keeps an unborn HEAD (HEAD -> missing master);
    // it must still be recognised through origin/main.
    git(machine, 'clone', path.join(canonDir, 'holoscript.git'), path.join(machine, 'D', 'clones', 'holoscript-old'));

    repo(path.join(work, 'fifteen-minute-ride'));
    repo(path.join(work, '.scratch', 'fixture-repo'));

    // Must never be entered.
    repo(path.join(work, 'HoloRepo', 'HoloScript', 'node_modules', 'pkg-with-git'));
    repo(path.join(machine, 'home', '.ssh', 'keys-repo'));
    let junctionMade = true;
    try {
      fs.symlinkSync(path.join(work, 'fifteen-minute-ride'), path.join(work, 'linked-ride'), 'junction');
    } catch {
      junctionMade = false;
    }

    const catalog = discoverMachineProjects({
      searchRoots: [work, path.join(machine, 'D'), path.join(machine, 'home')],
      canonGitDir: canonDir,
    });

    const holoscript = catalog.projects.find((p) => p.id === 'holoscript')!;
    expect(holoscript.kind).toBe('holorepo');
    expect(holoscript.primary?.path).toBe(path.resolve(primary));
    expect(holoscript.copies.map((c) => path.basename(c.path)).sort()).toEqual([
      'holoscript-old',
      'wt-feature',
    ]);
    expect(holoscript.copies.find((c) => c.path.endsWith('wt-feature'))?.worktree).toBe(true);

    const ride = catalog.projects.find((p) => p.id === 'fifteen-minute-ride')!;
    expect(ride.kind).toBe('outside');
    expect(ride.copies).toEqual([]); // the junction was not followed

    expect(catalog.projects.find((p) => p.id === 'fixture-repo')?.kind).toBe('scratch');

    const allPaths = catalog.projects.flatMap((p) => [p.primary?.path ?? '', ...p.copies.map((c) => c.path)]);
    expect(allPaths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(allPaths.some((p) => p.includes('.ssh'))).toBe(false);
    if (junctionMade) expect(allPaths.some((p) => p.endsWith('linked-ride'))).toBe(false);
  }, 120_000);
});
