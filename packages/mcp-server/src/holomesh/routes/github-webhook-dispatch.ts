/**
 * Which GitHub webhook deliveries get the quick-profile HoloCI dispatch.
 *
 * The receiver is push-only. Same-repo agent branches share that lane with
 * main. Fork agent branches do not, and pull_request is not dispatched, so a
 * fork PR never enters this privileged path.
 */

/**
 * Same-repo agent refs. The original allowlist was only `claude/` and `codex/`
 * (W.725). Live sessions also push `claude1/`, `claude2/`, `claude4/`, and
 * `cursor/`. A trailing session number is part of the prefix. `integrate/`,
 * `preserve/`, and `chore/` are not agent branches.
 */
const SAME_REPO_AGENT_BRANCH_REF = /^refs\/heads\/(?:claude|codex|cursor)\d*\//;

export function decideGithubCiDispatch(input: {
  event: string | undefined;
  ref: string;
  sha: string;
  repositoryFork: boolean;
}): { dispatch: boolean; reason: string } {
  if (input.event !== 'push') {
    return { dispatch: false, reason: `event "${input.event ?? ''}" not handled` };
  }
  const ref = input.ref;
  const isDefaultBranch = ref === 'refs/heads/main' || ref === 'refs/heads/master';
  const isAgentBranch = SAME_REPO_AGENT_BRANCH_REF.test(ref);
  // Fork repos do not inherit the agent-branch lane. Default-branch pushes keep
  // their previous behavior (this guard is only the agent-branch path).
  if (isAgentBranch && input.repositoryFork) {
    return {
      dispatch: false,
      reason: `ref "${ref}" is an agent branch on a fork; fork CI is not dispatched`,
    };
  }
  if (!isDefaultBranch && !isAgentBranch) {
    return {
      dispatch: false,
      reason: `ref "${ref}" is not main/master or a same-repo agent branch (claude*/codex*/cursor*)`,
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
