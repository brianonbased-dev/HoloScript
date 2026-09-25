/**
 * Push refs the GitHub receiver will check.
 *
 * On main the allowlist is main/master plus exactly two patterns:
 * `claude/` and `codex/` (`^refs/heads/(claude|codex)/`).
 * Same-repo agent branches that miss those two: numbered Claude sessions
 * (`claude1/`, `claude2/`, `claude4/`), `cursor/…`, and `hardware/…`.
 * A trailing session number is part of the prefix. `integrate/`, `preserve/`,
 * and `chore/` are not agent branches.
 */
const GITHUB_CI_AGENT_BRANCH_REF = /^refs\/heads\/(?:claude|codex|cursor|hardware)\d*\//;

export function isGithubCiPushRef(ref: string): boolean {
  return (
    ref === 'refs/heads/main' || ref === 'refs/heads/master' || GITHUB_CI_AGENT_BRANCH_REF.test(ref)
  );
}
