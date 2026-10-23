/**
 * Which commit is this process running? Surfaced on /health so an outage can
 * be tied to a deploy without opening Railway (2026-10-15: the dashboard said
 * e8c8e726 was "active" while no replica was running).
 *
 * Railway sets RAILWAY_GIT_COMMIT_SHA for GitHub-sourced deploys. A build can
 * also bake HOLOSCRIPT_BUILD_SHA. Only a hex commit id is ever echoed: never
 * any other env value, and null rather than a guess when none is set.
 */
const SOURCES = ['RAILWAY_GIT_COMMIT_SHA', 'HOLOSCRIPT_BUILD_SHA', 'GITHUB_SHA', 'GIT_COMMIT'] as const;
const SHA = /^[0-9a-f]{7,40}$/i;

export interface BuildCommit {
  sha: string | null;
  short: string | null;
  source: (typeof SOURCES)[number] | null;
}

export function getBuildCommit(env: NodeJS.ProcessEnv = process.env): BuildCommit {
  for (const name of SOURCES) {
    const value = env[name]?.trim();
    if (value && SHA.test(value)) {
      const sha = value.toLowerCase();
      return { sha, short: sha.slice(0, 8), source: name };
    }
  }
  return { sha: null, short: null, source: null };
}
