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

describe('scanning repositories it does not trust (review of #499)', () => {
  it('never runs a program named by a scanned repo config, and skips off-machine git pointers', () => {
    const machine = fs.mkdtempSync(path.join(os.tmpdir(), 'machine-catalog-hostile-'));
    const hostile = repo(path.join(machine, 'hostile'));
    // Forge a signed HEAD: a commit object carrying a gpgsig header.
    const tree = git(hostile, 'rev-parse', 'HEAD^{tree}');
    const parent = git(hostile, 'rev-parse', 'HEAD');
    const now = Math.floor(Date.now() / 1000);
    const commitText =
      `tree ${tree}\nparent ${parent}\nauthor A <a@x> ${now} +0000\ncommitter A <a@x> ${now} +0000\n` +
      `gpgsig -----BEGIN PGP SIGNATURE-----\n \n iQEz\n -----END PGP SIGNATURE-----\n\nsigned\n`;
    const commitFile = path.join(machine, 'commit.txt');
    fs.writeFileSync(commitFile, commitText);
    const signed = git(hostile, 'hash-object', '-t', 'commit', '-w', commitFile);
    git(hostile, 'update-ref', 'HEAD', signed);
    // The trap: any signature check runs this program.
    const marker = path.join(machine, 'gpg-was-run.txt');
    const fakeGpg = path.join(machine, process.platform === 'win32' ? 'fake-gpg.cmd' : 'fake-gpg.sh');
    fs.writeFileSync(
      fakeGpg,
      process.platform === 'win32' ? `@echo ran>>"${marker}"\r\n` : `#!/bin/sh\necho ran >> "${marker}"\n`
    );
    if (process.platform !== 'win32') fs.chmodSync(fakeGpg, 0o755);
    git(hostile, 'config', 'log.showSignature', 'true');
    git(hostile, 'config', 'gpg.program', fakeGpg);

    // Positive control: the trap is armed (plain git log runs it).
    try {
      git(hostile, 'log', '-1');
    } catch {
      /* the fake gpg fails verification; only whether it ran matters */
    }
    expect(fs.existsSync(marker), 'trap did not arm; test proves nothing').toBe(true);
    fs.rmSync(marker);

    // A worktree-style checkout whose .git file points at a network share.
    const offMachine = path.join(machine, 'off-machine');
    fs.mkdirSync(offMachine, { recursive: true });
    fs.writeFileSync(path.join(offMachine, '.git'), 'gitdir: \\\\unreachable-host.invalid\\share\\repo.git\n');

    const catalog = discoverMachineProjects({ searchRoots: [machine] });

    expect(fs.existsSync(marker)).toBe(false);
    const project = catalog.projects.find((p) => p.primary?.path === path.resolve(hostile));
    expect(project?.primary?.headDate).toBe(new Date(now * 1000).toISOString());
    const skipped = catalog.unidentified.find((c) => c.path === path.resolve(offMachine));
    expect(skipped?.skippedReason).toMatch(/off-machine/);
  }, 120_000);
});

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
