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


# ---------------------------------------------------------------------------
# Sidecar (co-located vLLM) — schema parsing + script generator (W.110/W.111).
#
# Per the AMBER memo at research/2026-04-26_lean4-on-qwen72b-awq-validation.md
# §7, each agent in agents-template.json may carry an OPTIONAL `sidecars[]`
# array. Each sidecar is a second vLLM process co-located on the same instance
# (different port, smaller VRAM share). The lean-theorist-brain → Goedel-V2-7B
# is the canonical use case (72B-AWQ general + 7B Lean-specialist on H200).
#
# THIS MODULE: schema validation + plan propagation + script-text generator.
# Execution path (SSH the sidecar startup, run health checks) is intentionally
# NOT wired in this commit — that requires live-instance validation and
# F.031 says we don't ship blind. Next agent flips the wiring once a fresh
# H200 is provisioned per task_1777238593020_7bvu step 2.
# ---------------------------------------------------------------------------

_SIDECAR_REQUIRED_FIELDS = ("name", "model", "port", "consumed_by_env_var")
_SIDECAR_OPTIONAL_DEFAULTS = {
    "vram_estimate_gb": None,   # validation-only; not enforced at deploy
    "vllm_args": [],
    "max_model_len": None,      # convenience; merged into vllm_args if set
}


def _validate_sidecar_specs(agent: dict) -> list[dict]:
    """Validate the optional `sidecars[]` array on an agent template entry.

    Returns a normalized list (each entry with all required + optional
    fields populated) or raises ValueError on bad shape. Returns [] when
    the field is absent.

    Required per AMBER §7.2: name (str), model (str), port (int 1024-65535),
    consumed_by_env_var (str, identifier-shape).
    Optional: vram_estimate_gb (int), vllm_args (list[str]), max_model_len (int).
    """
    raw = agent.get("sidecars")
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError(f"sidecars must be a list, got {type(raw).__name__}")
    out: list[dict] = []
    seen_ports: set[int] = set()
    seen_names: set[str] = set()
    for idx, spec in enumerate(raw):
        if not isinstance(spec, dict):
            raise ValueError(f"sidecars[{idx}] must be an object, got {type(spec).__name__}")
        for field in _SIDECAR_REQUIRED_FIELDS:
            if field not in spec or spec[field] in (None, ""):
                raise ValueError(f"sidecars[{idx}] missing required field '{field}'")
        if not isinstance(spec["name"], str) or not spec["name"]:
            raise ValueError(f"sidecars[{idx}].name must be a non-empty string")
        if not isinstance(spec["model"], str) or "/" not in spec["model"]:
            raise ValueError(f"sidecars[{idx}].model must look like 'org/repo'")
        if not isinstance(spec["port"], int) or not (1024 <= spec["port"] <= 65535):
            raise ValueError(f"sidecars[{idx}].port must be an int in [1024, 65535]")
        if not re.match(r"^[A-Z][A-Z0-9_]*$", spec["consumed_by_env_var"]):
            raise ValueError(
                f"sidecars[{idx}].consumed_by_env_var must be UPPER_SNAKE_CASE "
                f"(got {spec['consumed_by_env_var']!r})"
            )
        if spec["port"] == 8081:
            raise ValueError(
                f"sidecars[{idx}].port=8081 collides with main vLLM (bootstrap-agent.sh:273)"
            )
        if spec["port"] in seen_ports:
            raise ValueError(f"sidecars[{idx}].port={spec['port']} duplicated within agent")
        if spec["name"] in seen_names:
            raise ValueError(f"sidecars[{idx}].name={spec['name']!r} duplicated within agent")
        seen_ports.add(spec["port"])
        seen_names.add(spec["name"])
        # Optional fields — fill defaults
        normalized = {**_SIDECAR_OPTIONAL_DEFAULTS, **spec}
        if not isinstance(normalized["vllm_args"], list):
            raise ValueError(f"sidecars[{idx}].vllm_args must be a list of strings")
        if normalized.get("vram_estimate_gb") is not None:
            if not isinstance(normalized["vram_estimate_gb"], int) or normalized["vram_estimate_gb"] <= 0:
                raise ValueError(f"sidecars[{idx}].vram_estimate_gb must be a positive int")
        if normalized.get("max_model_len") is not None:
            if not isinstance(normalized["max_model_len"], int) or normalized["max_model_len"] <= 0:
                raise ValueError(f"sidecars[{idx}].max_model_len must be a positive int")
        out.append(normalized)
    return out


def _build_sidecar_env_lines(sidecars: list[dict]) -> list[str]:
    """Build KEY=VALUE lines for the agent.env so the runtime knows where
    each sidecar listens. The runtime dispatches based on these env vars
    (e.g. LEAN_SPECIALIST_URL) — see runner.ts dispatch heuristic in
    AMBER memo §7.5.
    """
    lines: list[str] = []
    for sc in sidecars:
        url = f"http://localhost:{sc['port']}/v1"
        lines.append(f"{sc['consumed_by_env_var']}={url}")
    return lines


def _build_sidecar_startup_script(sidecars: list[dict]) -> str:
    """Generate the shell script that starts each sidecar in a screen
    session per AMBER §7.3. Returns the full script text — does NOT
    execute. Caller is responsible for SCP + (gated) SSH execution.

    Uses screen-not-systemd because Vast.ai instances are W.111-ephemeral
    substrate; per-machine systemd unit files leak when instances rotate.
    """
    if not sidecars:
        return ""
    lines = [
        "#!/bin/bash",
        "# Auto-generated by deploy.py:_build_sidecar_startup_script.",
        "# Starts co-located vLLM sidecars per AMBER memo §7.3.",
        "# Idempotent: skips a sidecar if its screen session already exists.",
        "set -u",
        "LOG_DIR=\"${LOG_DIR:-/var/log}\"",
        "mkdir -p \"$LOG_DIR\"",
        "PY_BIN=$(command -v python3 || command -v python)",
        "if [ -z \"$PY_BIN\" ]; then echo 'FATAL: no python on PATH' >&2; exit 1; fi",
        "",
    ]
    for sc in sidecars:
        session = f"sidecar-{sc['name']}"
        log = f"$LOG_DIR/{session}.log"
        vllm_args = list(sc.get("vllm_args") or [])
        if sc.get("max_model_len"):
            vllm_args = ["--max-model-len", str(sc["max_model_len"])] + vllm_args
        # Re-quote vllm_args defensively so ' or " in user-supplied args don't
        # break the heredoc. Each arg is single-quoted; embedded single quotes
        # become '\''.
        quoted_args = " ".join(_shell_single_quote(a) for a in vllm_args)
        lines.extend([
            f"# --- sidecar: name={sc['name']} model={sc['model']} port={sc['port']} ---",
            f"if screen -ls | grep -q '\\.{session}\\b'; then",
            f"  echo '[sidecar] {session}: already running — skipping start'",
            "else",
            f"  echo '[sidecar] {session}: starting in screen session'",
            f"  screen -dmS {session} bash -c \"export VLLM_USE_V1=0 VLLM_WORKER_MULTIPROC_METHOD=spawn && \\\"$PY_BIN\\\" -m vllm.entrypoints.openai.api_server --model {sc['model']} --port {sc['port']} {quoted_args} >> {log} 2>&1\"",
            "fi",
            "",
        ])
    lines.append("echo '[sidecar] all sidecars dispatched (screen sessions); next: health-check'")
    return "\n".join(lines) + "\n"


def _build_sidecar_health_check(sidecars: list[dict]) -> str:
    """Generate the health-check shell script per AMBER §7.4.

    Sidecar failure is degraded, not fatal — the agent runtime falls back
    to the main vLLM if a sidecar 5xx/timeouts. This script reports per-
    sidecar status as PASS/DEGRADED/MISSING and exits 0 always (caller
    decides on degradation-tolerance policy).
    """
    if not sidecars:
        return ""
    lines = [
        "#!/bin/bash",
        "# Auto-generated by deploy.py:_build_sidecar_health_check.",
        "# Reports per-sidecar status. Always exits 0 (degraded-mode tolerance).",
        "set -u",
        "OVERALL_OK=1",
        "",
    ]
    for sc in sidecars:
        name = sc["name"]
        model = sc["model"]
        port = sc["port"]
        url = f"http://127.0.0.1:{port}/v1/models"
        lines.extend([
            f"# --- check: name={name} expected_model={model} ---",
            f"if RESP=$(curl -sS -m 10 {url} 2>/dev/null); then",
            f"  if echo \"$RESP\" | grep -q {_shell_single_quote(model)}; then",
            f"    echo 'sidecar {name}: PASS'",
            "  else",
            f"    echo 'sidecar {name}: DEGRADED (responding but model mismatch)'",
            "    OVERALL_OK=0",
            "  fi",
            "else",
            f"  echo 'sidecar {name}: MISSING (no /v1/models response)'",
            "  OVERALL_OK=0",
            "fi",
            "",
        ])
    lines.extend([
        "if [ \"$OVERALL_OK\" = \"1\" ]; then",
        "  echo 'sidecar-summary: all-PASS'",
        "else",
        "  echo 'sidecar-summary: degraded — agent will fall back to main vLLM for sidecar-routed tasks'",
        "fi",
        "exit 0",
    ])
    return "\n".join(lines) + "\n"


def _shell_single_quote(s: str) -> str:
    """POSIX single-quote escape: 'foo' -> 'foo'; foo'bar -> 'foo'\\''bar'."""
    return "'" + s.replace("'", "'\\''") + "'"


_LABEL_HANDLE_RE = re.compile(r"handle=([\w.-]+)")


def _handle_from_label(inst: dict) -> str | None:
    """Extract the handle from a Vast.ai instance label (W.111 contract).

    After deploy.py successfully bootstraps an instance, it calls
    `vastai label instance <id> handle=<handle>` so the handle is bound to
    the instance via Vast metadata (no SSH probe needed on subsequent
    queries). Returns None if the instance is unlabeled or the label
    doesn't carry a `handle=<x>` segment.

    Pre-W.111 instances may have label=None — in that case the caller
    should fall back to SSH-probing /root/agent.env (slower).
    """
    label = inst.get("label")
    if not label or not isinstance(label, str):
        return None
    m = _LABEL_HANDLE_RE.search(label)
    return m.group(1) if m else None


def vast_instances() -> list[dict]:
    """Fetch live instances + resolve direct SSH route (bypass proxy).

    W.111 (2026-04-26 dynamic-fleet contract): also surface handle if the
    instance has been labeled by a prior deploy.py run. Stored on the
    instance dict as `_handle_label` (None if unlabeled).
    """
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
            i["_handle_label"] = _handle_from_label(i)
            out.append(i)
        elif i.get("ssh_host"):
            # Fall back to proxy if no direct route — proxy may still work for
            # instances created AFTER the SSH key was registered.
            i["_direct_ssh_host"], i["_direct_ssh_port"] = i["ssh_host"], int(i["ssh_port"])
            i["_handle_label"] = _handle_from_label(i)
            out.append(i)
    return out


def label_instance_with_handle(instance_id: int, handle: str) -> bool:
    """Apply a `handle=<handle>` label to a Vast.ai instance via the CLI.

    Called after a successful deploy_one so subsequent deploy.py runs can
    read the handle from `vastai show instances` metadata directly,
    without SSHing into the box. Returns True on success.
    """
    try:
        cp = subprocess.run(
            ["vastai", "label", "instance", str(instance_id), f"handle={handle}"],
            capture_output=True, text=True, timeout=20
        )
        return cp.returncode == 0
    except Exception:
        return False


def build_plan(
    instances: list[dict],
    agents: list[dict],
    env: dict[str, str],
) -> list[dict]:
    """Match instances <-> agents in three phases.

    Phase 0 (W.111 idempotency, 2026-04-26): match by Vast `handle=<X>`
    label first. If an instance carries a label that matches a planned
    agent's handle, pair them and mark `_already_deployed=True`. The
    deploy-one path will skip re-bootstrap for already-deployed handles
    unless `--force-redeploy` is passed. This is the contract that lets
    the dynamic fleet rotate without losing handle→instance binding.

    Phase 1: instanceMatch regex pin (legacy — pre-W.111 path for
    instances that were rented before labels existed).

    Phase 2: index-order fill (legacy fallback — explicitly fragile under
    instance churn; only used when neither label nor instanceMatch
    resolves a pairing).
    """
    consumed_inst: set[int] = set()
    consumed_handles: set[str] = set()
    pairs: list[tuple[dict, dict, dict]] = []  # (inst, agent, meta)

    # Phase 0: Vast-label-pinned agents (idempotency path)
    agents_by_handle = {a["handle"]: a for a in agents}
    for inst in instances:
        labeled_handle = inst.get("_handle_label")
        if not labeled_handle:
            continue
        agent = agents_by_handle.get(labeled_handle)
        if not agent:
            print(f"  [unplanned] instance {inst['id']} carries handle={labeled_handle} not in agents-template — skipping")
            continue
        if agent["handle"] in consumed_handles:
            print(f"  [collision] handle={labeled_handle} already paired (W.087-class) — skipping instance {inst['id']}")
            continue
        pairs.append((inst, agent, {"already_deployed": True, "phase": "label"}))
        consumed_inst.add(inst["id"])
        consumed_handles.add(agent["handle"])
        print(f"  [label] {agent['handle']} -> {inst['id']} ({inst.get('gpu_name')}) via Vast label (idempotent)")

    # Phase 1: instanceMatch-pinned agents
    for agent in agents:
        if agent["handle"] in consumed_handles:
            continue
        match_re = agent.get("instanceMatch")
        if not match_re:
            continue
        for inst in instances:
            if inst["id"] in consumed_inst:
                continue
            haystack = f'{inst["id"]} {inst.get("gpu_name", "")}'
            if re.search(match_re, haystack):
                pairs.append((inst, agent, {"already_deployed": False, "phase": "instanceMatch"}))
                consumed_inst.add(inst["id"])
                consumed_handles.add(agent["handle"])
                print(f"  [pin] {agent['handle']} -> {inst['id']} ({inst.get('gpu_name')}) via instanceMatch={match_re}")
                break

    # Phase 2: index-order fill (legacy — fragile under instance churn,
    # but kept for backwards compat when neither labels nor instanceMatch
    # resolve. Once all instances carry W.111 labels, this path is dead code.)
    remaining_inst = [i for i in instances if i["id"] not in consumed_inst]
    remaining_agents = [a for a in agents if a["handle"] not in consumed_handles]
    for idx, inst in enumerate(remaining_inst):
        if not remaining_agents:
            break
        agent = remaining_agents[idx % len(remaining_agents)]
        pairs.append((inst, agent, {"already_deployed": False, "phase": "index-order"}))
        if idx < len(remaining_agents):
            consumed_handles.add(agent["handle"])
        print(f"  [index] {agent['handle']} -> {inst['id']} ({inst.get('gpu_name')}) via index-order (W.111-fragile)")

    # Resolve identity material per pair
    plans: list[dict] = []
    for idx, (inst, agent, meta) in enumerate(pairs):
        wallet = env.get(agent["walletEnvKey"]) or os.environ.get(agent["walletEnvKey"])
        bearer = env.get(agent["bearerEnvKey"]) or os.environ.get(agent["bearerEnvKey"])
        issues = []
        if not wallet:
            issues.append(f"wallet env {agent['walletEnvKey']} missing")
        if not bearer:
            issues.append(f"bearer env {agent['bearerEnvKey']} missing")
        # AMBER §7: validate optional sidecars[] up-front so bad shape
        # surfaces in the plan, not at deploy time.
        try:
            sidecars = _validate_sidecar_specs(agent)
        except ValueError as exc:
            sidecars = []
            issues.append(f"sidecars schema invalid: {exc}")
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
            "already_deployed": meta.get("already_deployed", False),
            "match_phase": meta.get("phase", "?"),
            "sidecars": sidecars,
            "issues": issues,
            "ok": not issues,
        })
    return plans


def deploy_one(plan: dict, ssh_key: str, bootstrap_script: Path, log_dir: Path,
               team_id: str, anthropic_key: str | None,
               openai_key: str | None, gemini_key: str | None,
               github_token: str | None = None,
               *, connect_timeout: int = 20,
               force_redeploy: bool = False) -> dict:
    """Deploy one instance: scp bootstrap.sh + per-instance env file +
    runner.sh, then ssh launches under nohup. Avoids bash quote-escaping
    by sourcing env from a file rather than embedding in the SSH command.

    W.111 idempotency (2026-04-26): if `plan['already_deployed']` is True
    (matched via Vast label `handle=<x>`) AND `force_redeploy` is False,
    we skip the bootstrap entirely and only verify health. The instance
    keeps its existing wallet/bearer/brain wired up — no double-rent, no
    double-bootstrap. With `--force-redeploy` the bootstrap re-runs.
    """
    log_file = log_dir / f"{plan['instance_id']}-{plan['handle']}.log"

    def log(msg: str) -> None:
        with log_file.open("a", encoding="utf-8") as fh:
            fh.write(f"[{datetime.now(timezone.utc).isoformat()}] {msg}\n")

    log(f"start deploy handle={plan['handle']} instance={plan['instance_id']} ssh={plan['ssh_host']}:{plan['ssh_port']} match_phase={plan.get('match_phase')} already_deployed={plan.get('already_deployed')}")

    # W.111 idempotency: short-circuit when the instance already carries
    # a Vast handle-label matching a planned agent and the operator hasn't
    # asked for a forced redeploy. We do NOT re-rent, NOT re-bootstrap,
    # NOT touch /root/agent.env, NOT clobber the supervisor wrapper. We
    # just verify the agent process is alive and return ok with step=verified.
    if plan.get("already_deployed") and not force_redeploy:
        ssh_verify = [
            "ssh", "-i", ssh_key,
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", f"ConnectTimeout={connect_timeout}",
            "-o", "BatchMode=yes",
            "-p", str(plan["ssh_port"]),
            f"root@{plan['ssh_host']}",
            "pgrep -f 'node dist/index.js run' >/dev/null && echo OK || echo NO_AGENT",
        ]
        try:
            cp = subprocess.run(ssh_verify, capture_output=True, text=True, timeout=connect_timeout + 10)
            alive = "OK" in (cp.stdout or "")
            log(f"idempotent verify: agent_alive={alive}")
            if alive:
                return {"handle": plan["handle"], "ok": True, "step": "verified-idempotent",
                        "instance_id": plan["instance_id"], "log": str(log_file)}
            log("idempotent verify: agent NOT running — falling through to full bootstrap")
        except Exception as e:
            log(f"idempotent verify failed: {e} — falling through to full bootstrap")

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

    # W.111: bind handle to instance via Vast label so subsequent deploy.py
    # runs see the pairing without SSH probing. Best-effort — failure here
    # doesn't fail the deploy (the SSH-probe fallback in audit-brain-identity
    # still works), but logs so operator sees if labeling is broken.
    if label_instance_with_handle(plan["instance_id"], plan["handle"]):
        log(f"vastai label set: handle={plan['handle']}")
    else:
        log(f"WARN: failed to set vastai label handle={plan['handle']} on instance {plan['instance_id']}")

    return {"handle": plan["handle"], "ok": True, "step": "dispatched", "log": str(log_file)}


def _self_test_sidecar_validation() -> None:
    """Self-tests for _validate_sidecar_specs. Run via --validate-only."""
    # Empty / absent → []
    assert _validate_sidecar_specs({}) == []
    assert _validate_sidecar_specs({"sidecars": None}) == []
    assert _validate_sidecar_specs({"sidecars": []}) == []

    # Valid minimal spec
    valid = _validate_sidecar_specs({
        "sidecars": [{
            "name": "lean-prover",
            "model": "Goedel-LM/Goedel-Prover-V2-7B",
            "port": 8082,
            "consumed_by_env_var": "LEAN_SPECIALIST_URL",
        }]
    })
    assert len(valid) == 1
    assert valid[0]["name"] == "lean-prover"
    assert valid[0]["vllm_args"] == []  # default

    # Bad type
    try:
        _validate_sidecar_specs({"sidecars": "not-a-list"})
        raise AssertionError("expected ValueError on string sidecars")
    except ValueError:
        pass

    # Missing required
    for missing in ("name", "model", "port", "consumed_by_env_var"):
        spec = {
            "name": "x", "model": "a/b", "port": 8082,
            "consumed_by_env_var": "FOO_URL",
        }
        del spec[missing]
        try:
            _validate_sidecar_specs({"sidecars": [spec]})
            raise AssertionError(f"expected ValueError on missing {missing}")
        except ValueError:
            pass

    # Port collision with main vLLM
    try:
        _validate_sidecar_specs({"sidecars": [{
            "name": "x", "model": "a/b", "port": 8081,
            "consumed_by_env_var": "FOO_URL",
        }]})
        raise AssertionError("expected ValueError on port=8081")
    except ValueError:
        pass

    # Bad env var name (must be UPPER_SNAKE_CASE)
    try:
        _validate_sidecar_specs({"sidecars": [{
            "name": "x", "model": "a/b", "port": 8082,
            "consumed_by_env_var": "lower_case",
        }]})
        raise AssertionError("expected ValueError on lower-case env var")
    except ValueError:
        pass

    # Duplicate ports within an agent
    try:
        _validate_sidecar_specs({"sidecars": [
            {"name": "a", "model": "x/y", "port": 8082, "consumed_by_env_var": "A_URL"},
            {"name": "b", "model": "x/y", "port": 8082, "consumed_by_env_var": "B_URL"},
        ]})
        raise AssertionError("expected ValueError on duplicate ports")
    except ValueError:
        pass

    # vllm_args must be a list
    try:
        _validate_sidecar_specs({"sidecars": [{
            "name": "x", "model": "a/b", "port": 8082,
            "consumed_by_env_var": "FOO_URL", "vllm_args": "--enforce-eager",
        }]})
        raise AssertionError("expected ValueError on string vllm_args")
    except ValueError:
        pass


def _self_test_sidecar_script_generation() -> None:
    """Self-tests for the sidecar script + health-check generators."""
    # Empty input → empty output
    assert _build_sidecar_startup_script([]) == ""
    assert _build_sidecar_health_check([]) == ""
    assert _build_sidecar_env_lines([]) == []

    sidecars = [{
        "name": "lean-prover",
        "model": "Goedel-LM/Goedel-Prover-V2-7B",
        "port": 8082,
        "consumed_by_env_var": "LEAN_SPECIALIST_URL",
        "vllm_args": ["--enforce-eager", "--gpu-memory-utilization=0.10"],
        "max_model_len": 4096,
        "vram_estimate_gb": 14,
    }]

    env_lines = _build_sidecar_env_lines(sidecars)
    assert env_lines == ["LEAN_SPECIALIST_URL=http://localhost:8082/v1"], env_lines

    startup = _build_sidecar_startup_script(sidecars)
    # Sanity checks — script must reference the model + port + screen session
    assert "Goedel-LM/Goedel-Prover-V2-7B" in startup
    assert "8082" in startup
    assert "screen -dmS sidecar-lean-prover" in startup
    assert "--enforce-eager" in startup
    assert "--max-model-len" in startup and "4096" in startup
    assert "VLLM_USE_V1=0" in startup  # W.102

    health = _build_sidecar_health_check(sidecars)
    assert "127.0.0.1:8082" in health
    assert "Goedel-LM/Goedel-Prover-V2-7B" in health
    assert "exit 0" in health  # degraded-mode tolerance

    # Shell-quote escaping: arg with embedded single quote
    quoted = _shell_single_quote("foo'bar")
    assert quoted == "'foo'\\''bar'", quoted
    quoted2 = _shell_single_quote("plain")
    assert quoted2 == "'plain'", quoted2


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
    p.add_argument("--force-redeploy", action="store_true",
                   help="W.111: re-bootstrap even instances already labeled with their handle. Default: skip already-deployed handles (idempotent).")
    p.add_argument("--validate-only", action="store_true",
                   help="AMBER §7: parse the config, validate sidecars[] schema on every agent, run self-tests, and exit. No vastai or SSH calls.")
    args = p.parse_args()

    # --validate-only: schema-test path, no vastai/SSH side effects.
    # Used by CI / next agent to confirm sidecars[] schema parses before
    # touching the live fleet. Self-contained — no test framework needed.
    if args.validate_only:
        print(f"=== deploy.py --validate-only @ {datetime.now(timezone.utc).isoformat()} ===")
        print(f"  config: {args.config}")
        if not args.config.exists():
            print(f"ERROR: config not found: {args.config}", file=sys.stderr)
            return 1
        config = json.loads(args.config.read_text(encoding="utf-8"))
        agents = config.get("agents") or []
        rc = 0
        total_sidecars = 0
        for agent in agents:
            handle = agent.get("handle", "?")
            try:
                sidecars = _validate_sidecar_specs(agent)
            except ValueError as exc:
                print(f"  [INVALID] {handle}: {exc}", file=sys.stderr)
                rc = 1
                continue
            if sidecars:
                names = ", ".join(f"{s['name']}@{s['port']}" for s in sidecars)
                print(f"  [OK] {handle}: {len(sidecars)} sidecar(s) — {names}")
                total_sidecars += len(sidecars)
            else:
                print(f"  [OK] {handle}: 0 sidecars")
        # Self-tests — synthetic specs to lock the contract.
        print()
        print("=== self-tests ===")
        try:
            _self_test_sidecar_validation()
            _self_test_sidecar_script_generation()
            print("  all self-tests PASS")
        except AssertionError as exc:
            print(f"  SELF-TEST FAILED: {exc}", file=sys.stderr)
            rc = 1
        print()
        print(f"summary: {len(agents)} agent(s), {total_sidecars} sidecar(s) across all enabled, exit={rc}")
        return rc

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
    print(f"{'idx':>3} {'instance':>10} {'gpu':<14} {'handle':<28} {'provider':<10} {'phase':<14} {'idempotent':<10} {'sidecars':<10} {'ok':<5}")
    total_sidecars = 0
    for pl in plans:
        idem = 'skip-bootstrap' if pl.get('already_deployed') else 'rebuild'
        sc_count = len(pl.get('sidecars') or [])
        total_sidecars += sc_count
        sc_label = f"{sc_count} (NOT YET WIRED)" if sc_count > 0 else "0"
        print(f"{pl['index']:>3} {pl['instance_id']:>10} {pl['gpu_name']:<14} {pl['handle']:<28} {pl['provider']:<10} {pl.get('match_phase', '?'):<14} {idem:<10} {sc_label:<10} {pl['ok']!s:<5}")
    if total_sidecars > 0:
        print(f"  NOTE: {total_sidecars} sidecar(s) declared but execution path is NOT YET WIRED in deploy_one (AMBER §7.3-7.5 deferred to next agent + live fleet). Use --validate-only to test the schema in isolation.")

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
                        github_token, force_redeploy=args.force_redeploy): pl
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
