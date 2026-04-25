#!/usr/bin/env python3
"""deploy.py - mass-deploy holoscript-agent to N rented Vast.ai instances.

Replaces Deploy-MeshAgents.ps1 (which hit PowerShell Start-Job
serialization issues with PSCustomObject args). Pure-Python via
subprocess+OpenSSH; works on Windows + macOS + Linux.

Pattern (per research 2026-04-24):
    vastai show instances --raw  -> parse host/port/gpu_name
    scp bootstrap-agent.sh       -> /root/bootstrap-agent.sh on each
    ssh 'env=... bootstrap.sh'   -> run with composed env vars
    capture per-instance log     -> mesh-deploy-logs/<id>-<handle>.log

Concurrent: ThreadPoolExecutor with --max-parallel cap (default 5).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path


def load_env(env_path: Path) -> dict[str, str]:
    """Parse a .env file into a dict. Keeps existing os.environ values."""
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$", line)
        if not m:
            continue
        out[m.group(1)] = m.group(2).strip("'\"")
    return out


def _direct_ssh(inst: dict) -> tuple[str, int] | None:
    """Resolve direct SSH host:port (bypass vast.ai proxy).

    Per research 2026-04-24 + verified-via-test: ssh.vast.ai proxy hosts
    require explicit `vastai attach ssh` which doesn't reliably work on
    instances rented before the SSH key was registered. Direct routing
    via public_ipaddr + ports['22/tcp'] works regardless.

    Returns None if instance lacks the direct fields (fall back to proxy).
    """
    ip = inst.get("public_ipaddr")
    ports = inst.get("ports") or {}
    port_entry = ports.get("22/tcp") if isinstance(ports, dict) else None
    if not ip or not port_entry:
        return None
    if isinstance(port_entry, list) and port_entry:
        port = port_entry[0].get("HostPort")
        if port:
            return ip.strip(), int(port)
    return None


def vast_instances() -> list[dict]:
    """Fetch live instances + resolve direct SSH route (bypass proxy)."""
    cp = subprocess.run(
        ["vastai", "show", "instances", "--raw"],
        capture_output=True, text=True, check=True
    )
    data = json.loads(cp.stdout)
    if isinstance(data, dict):
        data = [data]
    out = []
    for i in data:
        if i.get("actual_status") != "running":
            continue
        direct = _direct_ssh(i)
        if direct:
            i["_direct_ssh_host"], i["_direct_ssh_port"] = direct
            out.append(i)
        elif i.get("ssh_host"):
            # Fall back to proxy if no direct route — proxy may still work for
            # instances created AFTER the SSH key was registered.
            i["_direct_ssh_host"], i["_direct_ssh_port"] = i["ssh_host"], int(i["ssh_port"])
            out.append(i)
    return out


def build_plan(
    instances: list[dict],
    agents: list[dict],
    env: dict[str, str],
) -> list[dict]:
    """Match instances <-> agents, honoring instanceMatch pins first.
    Returns list of plan dicts ready to dispatch."""
    consumed_inst: set[int] = set()
    consumed_handles: set[str] = set()
    pairs: list[tuple[dict, dict]] = []

    # Phase 1: instanceMatch-pinned agents
    for agent in agents:
        match_re = agent.get("instanceMatch")
        if not match_re:
            continue
        for inst in instances:
            if inst["id"] in consumed_inst:
                continue
            haystack = f'{inst["id"]} {inst.get("gpu_name", "")}'
            if re.search(match_re, haystack):
                pairs.append((inst, agent))
                consumed_inst.add(inst["id"])
                consumed_handles.add(agent["handle"])
                print(f"  [pin] {agent['handle']} -> {inst['id']} ({inst.get('gpu_name')}) via instanceMatch={match_re}")
                break

    # Phase 2: index-order fill
    remaining_inst = [i for i in instances if i["id"] not in consumed_inst]
    remaining_agents = [a for a in agents if a["handle"] not in consumed_handles]
    for idx, inst in enumerate(remaining_inst):
        if not remaining_agents:
            break
        agent = remaining_agents[idx % len(remaining_agents)]
        pairs.append((inst, agent))

    # Resolve identity material per pair
    plans: list[dict] = []
    for idx, (inst, agent) in enumerate(pairs):
        wallet = env.get(agent["walletEnvKey"]) or os.environ.get(agent["walletEnvKey"])
        bearer = env.get(agent["bearerEnvKey"]) or os.environ.get(agent["bearerEnvKey"])
        issues = []
        if not wallet:
            issues.append(f"wallet env {agent['walletEnvKey']} missing")
        if not bearer:
            issues.append(f"bearer env {agent['bearerEnvKey']} missing")
        plans.append({
            "index": idx,
            "instance_id": inst["id"],
            "ssh_host": inst.get("_direct_ssh_host", inst.get("ssh_host")),
            "ssh_port": int(inst.get("_direct_ssh_port", inst.get("ssh_port", 22))),
            "gpu_name": inst.get("gpu_name", "?"),
            "handle": agent["handle"],
            "provider": agent["provider"],
            "model": agent["model"],
            "brain_path": agent["brainPath"],
            "wallet": wallet,
            "bearer": bearer,
            "budget": agent.get("budgetUsdPerDay", 5),
            "scope": agent.get("scopeTier", "warm"),
            "issues": issues,
            "ok": not issues,
        })
    return plans


def deploy_one(plan: dict, ssh_key: str, bootstrap_script: Path, log_dir: Path,
               team_id: str, anthropic_key: str | None,
               openai_key: str | None, gemini_key: str | None,
               github_token: str | None = None,
               connect_timeout: int = 20) -> dict:
    """Deploy one instance: scp bootstrap.sh + per-instance env file +
    runner.sh, then ssh launches under nohup. Avoids bash quote-escaping
    by sourcing env from a file rather than embedding in the SSH command.
    """
    log_file = log_dir / f"{plan['instance_id']}-{plan['handle']}.log"

    def log(msg: str) -> None:
        with log_file.open("a", encoding="utf-8") as fh:
            fh.write(f"[{datetime.now(timezone.utc).isoformat()}] {msg}\n")

    log(f"start deploy handle={plan['handle']} instance={plan['instance_id']} ssh={plan['ssh_host']}:{plan['ssh_port']}")

    ssh_base = [
        "ssh", "-i", ssh_key,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", f"ConnectTimeout={connect_timeout}",
        "-o", "BatchMode=yes",
        "-p", str(plan["ssh_port"]),
    ]
    scp_base = [
        "scp", "-i", ssh_key,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", f"ConnectTimeout={connect_timeout}",
        "-o", "BatchMode=yes",
        "-P", str(plan["ssh_port"]),
    ]
    remote = f"root@{plan['ssh_host']}"

    # ----- Resolve local brain composition file (will be scp'd to /root/) -----
    # ai-ecosystem repo isn't reachable from instances (PAT scoped to HoloScript only),
    # so we ship the brain file inline. Bootstrap accepts absolute path and skips clone.
    brain_local = Path.home() / ".ai-ecosystem" / plan["brain_path"]
    brain_basename = Path(plan["brain_path"]).name
    brain_remote = f"/root/{brain_basename}"
    if not brain_local.exists():
        log(f"FATAL: brain file not found locally: {brain_local}")
        return {"handle": plan["handle"], "ok": False, "step": "brain-missing",
                "log": str(log_file)}

    # ----- Build per-instance env file (plain key=value, NO bash quoting) -----
    env_lines = [
        f"HOLOSCRIPT_AGENT_HANDLE={plan['handle']}",
        f"HOLOSCRIPT_AGENT_PROVIDER={plan['provider']}",
        f"HOLOSCRIPT_AGENT_MODEL={plan['model']}",
        f"HOLOSCRIPT_AGENT_BRAIN={brain_remote}",
        f"HOLOSCRIPT_AGENT_WALLET={plan['wallet']}",
        f"HOLOSCRIPT_AGENT_X402_BEARER={plan['bearer']}",
        f"HOLOSCRIPT_AGENT_BUDGET_USD_DAY={plan['budget']}",
        f"HOLOSCRIPT_AGENT_SCOPE_TIER={plan['scope']}",
        f"HOLOMESH_TEAM_ID={team_id}",
    ]
    if github_token:
        # Embed PAT in HoloScript clone URL (PAT scoped to HoloScript only;
        # ai-ecosystem brain file is shipped inline above instead of cloned).
        env_lines.append(
            f"HOLOSCRIPT_REPO_URL=https://x-access-token:{github_token}@github.com/brianonbased-dev/HoloScript.git"
        )
    if plan["provider"] == "anthropic" and anthropic_key:
        env_lines.append(f"ANTHROPIC_API_KEY={anthropic_key}")
    elif plan["provider"] == "openai" and openai_key:
        env_lines.append(f"OPENAI_API_KEY={openai_key}")
    elif plan["provider"] == "gemini" and gemini_key:
        env_lines.append(f"GEMINI_API_KEY={gemini_key}")
    elif plan["provider"] == "local-llm":
        env_lines.append("START_LOCAL_LLM_SERVER=1")
        env_lines.append(f"LOCAL_LLM_MODEL={plan['model']}")
        # Wire the agent runtime to the vLLM URL bootstrap-agent.sh starts.
        # Without this, the daemon defaults to localhost:8080 (which Vast.ai's
        # Jupyter holds) and silently fails every LLM call. Observed 2026-04-25:
        # daemon launched outside bootstrap (e.g. by a switch-team restart) had
        # no LOCAL_LLM_BASE_URL exported and never reached vLLM on 8081.
        env_lines.append("HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL=http://localhost:8081/v1")

    env_text = "\n".join(env_lines) + "\n"
    runner_text = (
        "#!/bin/bash\n"
        "set -a\n"
        "source /root/agent.env\n"
        "set +a\n"
        "chmod +x /root/bootstrap-agent.sh\n"
        "nohup /root/bootstrap-agent.sh > /root/bootstrap-stdout.log 2>&1 < /dev/null &\n"
        "sleep 2\n"
        "echo DEPLOY_DISPATCHED\n"
    )

    # ----- Stage local files for scp -----
    staging = log_dir / f".stage-{plan['instance_id']}"
    staging.mkdir(parents=True, exist_ok=True)
    env_file = staging / "agent.env"
    runner_file = staging / "runner.sh"
    env_file.write_text(env_text, encoding="utf-8", newline="\n")
    runner_file.write_text(runner_text, encoding="utf-8", newline="\n")

    # ----- Step 1: scp four files in one command (bootstrap, env, runner, brain) -----
    log(f"scp bootstrap-agent.sh + agent.env + runner.sh + {brain_basename} ...")
    scp_cmd = scp_base + [
        str(bootstrap_script),
        str(env_file),
        str(runner_file),
        str(brain_local),
        f"{remote}:/root/",
    ]
    cp = subprocess.run(scp_cmd, capture_output=True, text=True, timeout=connect_timeout * 3)
    log(f"scp exit={cp.returncode} stderr={cp.stderr[:300]}")
    if cp.returncode != 0:
        return {"handle": plan["handle"], "ok": False, "step": "scp", "log": str(log_file)}

    # ----- Step 2: ssh + bash runner.sh -----
    log("ssh + bash runner.sh (background bootstrap via nohup)")
    ssh_cmd = ssh_base + [remote, "bash /root/runner.sh"]
    try:
        cp = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=connect_timeout * 3)
    except subprocess.TimeoutExpired as exc:
        log(f"ssh TIMEOUT: {exc}")
        return {"handle": plan["handle"], "ok": False, "step": "ssh-timeout", "log": str(log_file)}
    log(f"ssh exit={cp.returncode} stdout={cp.stdout[:300]} stderr={cp.stderr[:300]}")

    if cp.returncode != 0 or "DEPLOY_DISPATCHED" not in cp.stdout:
        return {"handle": plan["handle"], "ok": False, "step": "ssh-bootstrap", "log": str(log_file)}

    log("DISPATCH OK - bootstrap running on instance via nohup")
    return {"handle": plan["handle"], "ok": True, "log": str(log_file)}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", type=Path, required=True, help="agents.json path")
    p.add_argument("--ssh-key", type=Path, default=Path.home() / ".ssh" / "id_rsa")
    p.add_argument("--bootstrap-script", type=Path,
                   default=Path(__file__).parent / "bootstrap-agent.sh")
    p.add_argument("--log-dir", type=Path,
                   default=Path(__file__).parent / "mesh-deploy-logs")
    p.add_argument("--env-file", type=Path,
                   default=Path.home() / "Documents" / "GitHub" / "HoloScript" / ".env")
    p.add_argument("--instance-filter", default="",
                   help="regex; matches against '<id> <gpu_name>'")
    p.add_argument("--instance-exclude", default="",
                   help="regex; excludes instances where '<id> <gpu_name>' matches")
    p.add_argument("--max-parallel", type=int, default=5)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.config.exists():
        print(f"ERROR: config not found: {args.config}", file=sys.stderr)
        return 1
    if not args.ssh_key.exists():
        print(f"ERROR: ssh key not found: {args.ssh_key}", file=sys.stderr)
        return 1
    if not args.bootstrap_script.exists():
        print(f"ERROR: bootstrap script not found: {args.bootstrap_script}", file=sys.stderr)
        return 1
    args.log_dir.mkdir(parents=True, exist_ok=True)

    print(f"=== deploy.py @ {datetime.now(timezone.utc).isoformat()} ===")
    print(f"  config:           {args.config}")
    print(f"  ssh-key:          {args.ssh_key}")
    print(f"  bootstrap-script: {args.bootstrap_script}")
    print(f"  log-dir:          {args.log_dir}")
    print(f"  env-file:         {args.env_file}")
    print(f"  instance-filter:  {args.instance_filter or '<none>'}")
    print(f"  max-parallel:     {args.max_parallel}")
    print(f"  dry-run:          {args.dry_run}")
    print()

    env = load_env(args.env_file)
    print(f"[env] loaded {len(env)} vars from {args.env_file}")

    print("[vastai] fetching live instances ...")
    instances = vast_instances()
    if args.instance_filter:
        instances = [
            i for i in instances
            if re.search(args.instance_filter, f'{i["id"]} {i.get("gpu_name", "")}')
        ]
    if args.instance_exclude:
        instances = [
            i for i in instances
            if not re.search(args.instance_exclude, f'{i["id"]} {i.get("gpu_name", "")}')
        ]
    print(f"  {len(instances)} instance(s) after filter/exclude")

    config = json.loads(args.config.read_text(encoding="utf-8"))
    agents = [a for a in config["agents"] if a.get("enabled", True)]
    print(f"  {len(agents)} agent(s) enabled in config")

    if not instances or not agents:
        print("nothing to deploy")
        return 0

    plans = build_plan(instances, agents, env)
    print()
    print("=== PLAN ===")
    print(f"{'idx':>3} {'instance':>10} {'gpu':<14} {'handle':<18} {'provider':<10} {'ok':<5}")
    for pl in plans:
        print(f"{pl['index']:>3} {pl['instance_id']:>10} {pl['gpu_name']:<14} {pl['handle']:<18} {pl['provider']:<10} {pl['ok']!s:<5}")

    blocked = [pl for pl in plans if not pl["ok"]]
    if blocked:
        print()
        print(f"BLOCKED: {len(blocked)} plan(s) missing identity material:")
        for pl in blocked:
            print(f"  [{pl['index']}] {pl['handle']}: {', '.join(pl['issues'])}")
        if not args.dry_run:
            print("aborting (re-run with --dry-run to see plan only)")
            return 3

    if args.dry_run:
        print("\nDRY-RUN — no execution.")
        return 0

    team_id = env.get("HOLOMESH_TEAM_ID") or os.environ.get("HOLOMESH_TEAM_ID")
    anthropic_key = env.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
    openai_key = env.get("OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    gemini_key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    github_token = env.get("GITHUB_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not github_token:
        print("WARN: GITHUB_TOKEN not in env — private-repo clone will fail in bootstrap")
    if not team_id:
        print("ERROR: HOLOMESH_TEAM_ID not in env", file=sys.stderr)
        return 1

    print()
    print(f"=== EXECUTING ({len(plans)} instances, max-parallel={args.max_parallel}) ===")
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.max_parallel) as pool:
        futures = {
            pool.submit(deploy_one, pl, str(args.ssh_key), args.bootstrap_script,
                        args.log_dir, team_id, anthropic_key, openai_key, gemini_key,
                        github_token): pl
            for pl in plans
        }
        for future in as_completed(futures):
            pl = futures[future]
            try:
                r = future.result()
            except Exception as exc:
                r = {"handle": pl["handle"], "ok": False, "step": "exception",
                     "error": str(exc), "log": "(no log)"}
            tag = "OK  " if r["ok"] else "FAIL"
            print(f"  [{tag}] #{pl['index']} {r['handle']} - log={r.get('log')} step={r.get('step', '-')}")
            results.append(r)

    print()
    print("=== SUMMARY ===")
    ok = sum(1 for r in results if r["ok"])
    fail = len(results) - ok
    print(f"  {ok}/{len(results)} dispatched, {fail} failed")
    print(f"  Bootstraps now running on each instance via nohup; check progress with:")
    print(f"    ssh -i {args.ssh_key} -p <port> root@<host> 'tail -f /root/bootstrap-stdout.log'")
    print(f"  Or via vastai dashboard logs.")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
