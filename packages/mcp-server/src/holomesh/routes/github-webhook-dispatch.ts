/**
 * Which GitHub webhook deliveries get the quick-profile HoloCI dispatch.
 *
 * The receiver is push-only. Same-repo agent branches share that lane with
 * main. A fork (an outside copy) never dispatches: that code must not run on
 * our machines. pull_request stays unhandled, so a fork PR cannot enter either.
 */

/**
 * Same-repo agent refs. The original allowlist was only `claude/` and `codex/`.
 * Live names that miss that pair: numbered Claude sessions (`claude1/`,
 * `claude2/`, `claude4/`), `cursor/…`, and `hardware/…`. A trailing session
 * number is part of the prefix. `integrate/`, `preserve/`, and `chore/` are
 * not agent branches.
 */
const SAME_REPO_AGENT_BRANCH_REF = /^refs\/heads\/(?:claude|codex|cursor|hardware)\d*\//;

export function decideGithubCiDispatch(input: {
  event: string | undefined;
  ref: string;
  sha: string;
  repositoryFork: boolean;
}): { dispatch: boolean; reason: string } {
  if (input.event !== 'push') {
    return { dispatch: false, reason: `event "${input.event ?? ''}" not handled` };
  }
  if (input.repositoryFork) {
    return {
      dispatch: false,
      reason: 'fork repository: outside copies are not checked on our machines',
    };
  }
  const ref = input.ref;
  const isDefaultBranch = ref === 'refs/heads/main' || ref === 'refs/heads/master';
  const isAgentBranch = SAME_REPO_AGENT_BRANCH_REF.test(ref);
  if (!isDefaultBranch && !isAgentBranch) {
    return {
      dispatch: false,
      reason: `ref "${ref}" is not main/master or a same-repo agent branch (claude*/codex*/cursor*/hardware*)`,
    };
  }
  if (!input.sha || /^0+$/.test(input.sha)) {
    return { dispatch: false, reason: 'branch deletion' };
  }
  return {
    dispatch: true,
    reason: isDefaultBranch ? 'default branch' : 'same-repo agent branch',
  };
}
