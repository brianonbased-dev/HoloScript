#!/usr/bin/env python3
"""
Fleet-Adversarial Worker Daemon Deployer
=========================================

Reads scripts/mesh-deploy/agents.json, filters to security-auditor brains,
and deploys the worker-dispatch-consumer.mjs daemon to each box via the
vast.ai CLI.

Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §2.

Each security-auditor brain (workers 04, 09, 14, 19, 24 per agents.json
_role) gets ONE long-running daemon process that:
  1. Polls GET /api/holomesh/agent/<self>/dispatch
  2. Drains pending DispatchEntries
  3. Invokes runX(opts) attacker loop matching cell.attack_class
  4. Emits CAEL records via POST /audit (auth: bearer-must-match-handle)

Prerequisites:
  - vastai CLI installed + logged in
  - HoloScript repo already cloned to /root/holoscript-mesh on each box
    (done by mesh-deploy/bootstrap-agent.sh)
  - Per-handle x402 bearers in env: HOLOMESH_API_KEY_MESH_<NN>_X402

Usage:
  # Dry-run: print the vastai exec commands without running them
  python scripts/fleet-adversarial/deploy-workers.py --dry-run

  # Live deploy to all 5 security-auditor boxes
  python scripts/fleet-adversarial/deploy-workers.py

  # Deploy to a single handle
  python scripts/fleet-adversarial/deploy-workers.py --handle mesh-worker-04

  # Stop daemons (kills the worker-dispatch-consumer process on each box)
  python scripts/fleet-adversarial/deploy-workers.py --stop

  # Status check (greps for live daemon on each box)
  python scripts/fleet-adversarial/deploy-workers.py --status

Cost discipline: this deployer does NOT spin up new instances. It
deploys to the EXISTING fleet (db96dbaa3 + 483026a25). Worker boxes
must already be rented + bootstrapped.

Author: Claude (Opus 4.7, 1M ctx) — claude-code surface, 2026-04-25 session.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional


REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_JSON = REPO_ROOT / "scripts" / "mesh-deploy" / "agents.json"
DEPLOY_LOGS_DIR = REPO_ROOT / "scripts" / "mesh-deploy" / "mesh-deploy-logs"

WORKER_WORKSPACE = "/root/holoscript-mesh"
DAEMON_LOG_DIR = "/root/agent-logs"
DAEMON_LOG = f"{DAEMON_LOG_DIR}/dispatch-consumer.log"
DAEMON_PID = f"{DAEMON_LOG_DIR}/dispatch-consumer.pid"
DAEMON_SCRIPT = f"{WORKER_WORKSPACE}/scripts/fleet-adversarial/worker-dispatch-consumer.mjs"
SECURITY_AUDITOR_BRAIN = "security-auditor-brain"


def load_agents() -> list:
    with open(AGENTS_JSON) as f:
        data = json.load(f)
    return data.get("agents", [])


def filter_security_auditors(agents: list) -> list:
    """Only deploy to security-auditor brains. They run the attacker loops."""
    out = []
    for a in agents:
        brain = (a.get("brainPath") or "").rsplit("/", 1)[-1].replace(".hsplus", "")
        if brain == SECURITY_AUDITOR_BRAIN and a.get("enabled", True):
            out.append(a)
    return out


_LOG_INSTANCE_CACHE: Optional[dict] = None


def _build_log_instance_cache() -> dict:
    """Scan mesh-deploy-logs/ for <instance-id>-<handle>.log naming convention,
    return {handle → instance_id}."""
    global _LOG_INSTANCE_CACHE
    if _LOG_INSTANCE_CACHE is not None:
        return _LOG_INSTANCE_CACHE
    cache = {}
    if DEPLOY_LOGS_DIR.exists():
        for log in DEPLOY_LOGS_DIR.iterdir():
            if not log.suffix == ".log":
                continue
            stem = log.stem  # e.g. "35550829-mesh-worker-02"
            parts = stem.split("-", 1)
            if len(parts) == 2 and parts[0].isdigit():
                instance_id, handle = parts
                cache[handle] = instance_id
    _LOG_INSTANCE_CACHE = cache
    return cache


def vastai_instance_id(agent: dict) -> Optional[str]:
    """Resolve vast.ai instance ID for an agent.

    Resolution order:
      1. agent.vastInstanceId (explicit override in agents.json)
      2. agent.instanceMatch (legacy hint field; e.g. "H200")
      3. Auto-scan mesh-deploy-logs/<id>-<handle>.log filenames

    The third path lets the deployer work without editing agents.json
    after the fleet rolls (each new bootstrap creates a fresh log file
    with the new instance ID).
    """
    explicit = agent.get("vastInstanceId")
    if explicit:
        return str(explicit)
    handle = agent.get("handle")
    if handle:
        cache = _build_log_instance_cache()
        from_log = cache.get(handle)
        if from_log:
            return from_log
    instance_match = agent.get("instanceMatch")
    if instance_match and instance_match.isdigit():
        return instance_match
    return None


def build_start_command(agent: dict) -> str:
    """Build the SSH/exec command that starts the daemon on the worker box.

    Pattern: kill any existing daemon, pull latest code, start fresh in nohup.
    """
    handle = agent["handle"]
    bearer_env = agent.get("bearerEnvKey", "")
    cmd = (
        # 1. Kill any existing daemon (idempotent restart)
        f"if [ -f {DAEMON_PID} ]; then "
        f"  kill $(cat {DAEMON_PID}) 2>/dev/null || true; "
        f"  rm -f {DAEMON_PID}; "
        f"fi; "
        # 2. Pull latest code (in case worker-dispatch-consumer wasn't shipped at bootstrap)
        f"cd {WORKER_WORKSPACE} && git fetch origin && git checkout main && git pull origin main; "
        # 3. Ensure log dir
        f"mkdir -p {DAEMON_LOG_DIR}; "
        # 4. Start daemon in nohup, capture PID
        f"nohup node {DAEMON_SCRIPT} "
        f"  --handle {handle} "
        f"  --tick-ms 30000 "
        f"  > {DAEMON_LOG} 2>&1 & "
        f"echo $! > {DAEMON_PID}; "
        # 5. Confirm running after 2s
        f"sleep 2; "
        f"if kill -0 $(cat {DAEMON_PID}) 2>/dev/null; then "
        f"  echo \"[deploy] {handle}: daemon started, pid=$(cat {DAEMON_PID})\"; "
        f"else "
        f"  echo \"[deploy] {handle}: FAILED to start, see {DAEMON_LOG}\"; "
        f"  tail -20 {DAEMON_LOG}; "
        f"  exit 1; "
        f"fi"
    )
    return cmd


def build_stop_command(agent: dict) -> str:
    handle = agent["handle"]
    return (
        f"if [ -f {DAEMON_PID} ]; then "
        f"  kill $(cat {DAEMON_PID}) 2>/dev/null && echo \"[deploy] {handle}: stopped pid=$(cat {DAEMON_PID})\" || echo \"[deploy] {handle}: already stopped\"; "
        f"  rm -f {DAEMON_PID}; "
        f"else "
        f"  echo \"[deploy] {handle}: no daemon pid file (not running)\"; "
        f"fi"
    )


def build_status_command(agent: dict) -> str:
    handle = agent["handle"]
    return (
        f"if [ -f {DAEMON_PID} ]; then "
        f"  PID=$(cat {DAEMON_PID}); "
        f"  if kill -0 $PID 2>/dev/null; then "
        f"    echo \"[deploy] {handle}: ALIVE pid=$PID\"; "
        f"    tail -5 {DAEMON_LOG}; "
        f"  else "
        f"    echo \"[deploy] {handle}: DEAD (stale pid file pid=$PID)\"; "
        f"  fi; "
        f"else "
        f"  echo \"[deploy] {handle}: NO PID FILE\"; "
        f"fi"
    )


def execute_on_box(agent: dict, command: str, dry_run: bool) -> int:
    """Use `vastai exec` to run the command on the agent's box.

    Returns: 0 on success, non-zero on failure.
    """
    instance_id = vastai_instance_id(agent)
    if not instance_id:
        print(f"[deploy] WARNING: {agent['handle']} has no instance ID — skipping. "
              f"Set 'vastInstanceId' in agents.json or override via env.")
        return 0  # not a hard failure — agent might be on a non-vast box

    full = ["vastai", "exec", str(instance_id), command]
    if dry_run:
        print(f"[deploy] DRY-RUN: {agent['handle']} (instance {instance_id})")
        print(f"  command: {command[:120]}...")
        return 0

    print(f"[deploy] {agent['handle']} (instance {instance_id})...")
    try:
        result = subprocess.run(
            full,
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.stdout:
            print(result.stdout.strip())
        if result.stderr:
            print(f"  stderr: {result.stderr.strip()}", file=sys.stderr)
        return result.returncode
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT after 120s", file=sys.stderr)
        return 1
    except FileNotFoundError:
        print(f"  FATAL: vastai CLI not found in PATH. Install with `pip install vastai`.",
              file=sys.stderr)
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    parser.add_argument("--handle", help="Deploy to a single handle (e.g. mesh-worker-04)")
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing")
    parser.add_argument("--stop", action="store_true", help="Stop daemons instead of starting")
    parser.add_argument("--status", action="store_true", help="Check daemon status on each box")
    args = parser.parse_args()

    if sum([args.stop, args.status, False]) > 1:
        print("[deploy] FATAL: --stop and --status are mutually exclusive", file=sys.stderr)
        return 2

    agents = load_agents()
    auditors = filter_security_auditors(agents)
    if args.handle:
        auditors = [a for a in auditors if a["handle"] == args.handle]
        if not auditors:
            print(f"[deploy] FATAL: handle {args.handle} not found in security-auditor pool",
                  file=sys.stderr)
            return 2

    print(f"[deploy] target pool: {len(auditors)} security-auditor brain(s)")
    for a in auditors:
        print(f"  - {a['handle']} (brain={a['brainPath'].rsplit('/', 1)[-1]}, instance={vastai_instance_id(a) or 'UNKNOWN'})")
    print()

    if args.status:
        builder = build_status_command
        op = "status"
    elif args.stop:
        builder = build_stop_command
        op = "stop"
    else:
        builder = build_start_command
        op = "start"

    print(f"[deploy] operation: {op}")
    print()

    failures = 0
    for agent in auditors:
        rc = execute_on_box(agent, builder(agent), args.dry_run)
        if rc != 0:
            failures += 1
            print(f"  → FAILED ({rc})")
        print()

    if failures == 0:
        print(f"[deploy] {op}: {len(auditors)}/{len(auditors)} OK")
        return 0
    print(f"[deploy] {op}: {len(auditors) - failures}/{len(auditors)} OK ({failures} failed)",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
