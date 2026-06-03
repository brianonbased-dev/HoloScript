import { describe, it, expect } from 'vitest';
import { buildWorkload, handleHoloCiTool, holoCiTools } from '../holo-ci-tools';

const SHA = 'a'.repeat(40);

describe('holo-ci-tools', () => {
  it('exposes exactly one tool, holo_ci_dispatch', () => {
    expect(holoCiTools.map((t) => t.name)).toEqual(['holo_ci_dispatch']);
  });

  it('builds a full-profile workload for HoloScript', () => {
    const { workload, contexts } = buildWorkload({ repo: 'brianonbased-dev/HoloScript', sha: SHA });
    expect(workload.lane).toBe('ci');
    expect(workload.jobs.length).toBeGreaterThanOrEqual(5);
    // every gate becomes a commit-status context
    expect(contexts).toEqual(workload.jobs.map((j) => `holo-ci/${j.id as string}`));
    // frozen-lockfile must always be present (deploy-bricking gate)
    expect(workload.jobs.some((j) => j.id === 'frozen-lockfile')).toBe(true);
    // cold-consume is the W.667 BLOCKING release gate — it MUST stay in lockstep
    // with the canonical scripts/holo-ci/gates.mjs so a dispatch via this tool can
    // never silently skip the fence that caught non-installable @holoscript/core.
    expect(workload.jobs.some((j) => j.id === 'cold-consume')).toBe(true);
  });

  it('quick profile is a strict subset of full', () => {
    const quick = buildWorkload({
      repo: 'brianonbased-dev/HoloScript',
      sha: SHA,
      profile: 'quick',
    });
    const full = buildWorkload({ repo: 'brianonbased-dev/HoloScript', sha: SHA, profile: 'full' });
    expect(quick.workload.jobs.length).toBeLessThan(full.workload.jobs.length);
    const fullIds = new Set(full.workload.jobs.map((j) => j.id));
    for (const j of quick.workload.jobs) expect(fullIds.has(j.id)).toBe(true);
  });

  it('embeds the exact sha into every gate command', () => {
    const { workload } = buildWorkload({ repo: 'brianonbased-dev/HoloScript', sha: SHA });
    for (const j of workload.jobs) {
      expect(String(j.command)).toContain(`git checkout --quiet --force ${SHA}`);
    }
  });

  it('rejects a non-hex sha (shell-injection guard)', () => {
    expect(() =>
      buildWorkload({ repo: 'brianonbased-dev/HoloScript', sha: 'abc; rm -rf /' })
    ).toThrow(/unsafe commit sha/);
  });

  it('rejects a repo outside the allowlist', () => {
    expect(() => buildWorkload({ repo: 'evil/repo', sha: SHA })).toThrow(/not allowed/);
  });

  it('normalizes a full git URL to the canonical repo key', () => {
    const { workload } = buildWorkload({
      repo: 'https://github.com/brianonbased-dev/HoloScript.git',
      sha: SHA,
    });
    expect(workload.name).toContain('brianonbased-dev/HoloScript');
  });

  it('dryRun returns the workload without needing a key and never submits', async () => {
    const res = (await handleHoloCiTool('holo_ci_dispatch', { sha: SHA, dryRun: true })) as {
      ok: boolean;
      dryRun: boolean;
      gateCount: number;
      contexts: string[];
      workload: unknown;
    };
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(res.gateCount).toBeGreaterThanOrEqual(5);
    expect(res.contexts.length).toBe(res.gateCount);
  });

  it('returns a clean error (not a throw) for a missing sha', async () => {
    const res = (await handleHoloCiTool('holo_ci_dispatch', {})) as { ok: boolean; error: string };
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sha is required/);
  });

  it('is safe-by-default: a bare call (no dryRun) previews and never submits real spend', async () => {
    // Spending GPU budget must be a deliberate opt-in (dryRun:false), not the default —
    // any authenticated MCP token reaches this handler, so a bare call must not burn fleet.
    const res = (await handleHoloCiTool('holo_ci_dispatch', { sha: SHA })) as {
      ok: boolean;
      dryRun: boolean;
    };
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
  });

  it('returns null for an unrelated tool name', async () => {
    expect(await handleHoloCiTool('some_other_tool', {})).toBeNull();
  });

  it('without an orchestrator key, a non-dry run reports a clean provisioning error', async () => {
    const prevA = process.env.HOLOSCRIPT_API_KEY;
    const prevB = process.env.HOLOMESH_API_KEY;
    delete process.env.HOLOSCRIPT_API_KEY;
    delete process.env.HOLOMESH_API_KEY;
    try {
      // dryRun:false = explicit opt-in to the real submit path (the only path that needs a key).
      const res = (await handleHoloCiTool('holo_ci_dispatch', { sha: SHA, dryRun: false })) as {
        ok: boolean;
        error: string;
      };
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/not provisioned/i);
    } finally {
      if (prevA !== undefined) process.env.HOLOSCRIPT_API_KEY = prevA;
      if (prevB !== undefined) process.env.HOLOMESH_API_KEY = prevB;
    }
  });
});
