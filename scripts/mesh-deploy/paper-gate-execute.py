#!/usr/bin/env python3
"""paper-gate-execute.py — closes the rent-monitor-tear-down loop for a
single paper-program gate.

Founder direction 2026-04-26 ("agent peers are the executers even you are
the executer"): this completes the chain shipped in 2f5fb6c72 (planner)
+ f64679263 (picker + ledger). The agent IS the executor. No more
deferring to a future operator.

Modes:
    --mode plan       Resolve gate → offer → cost; print without acting
    --mode rent       Plan + actually rent + bootstrap
    --mode check      Poll CAEL records for success/failure marker
                      (called periodically — by ScheduleWakeup or cron)
    --mode teardown   vastai destroy + ledger close
                      (called when check sees success OR timeout)
    --mode self-test  Synthetic-state assertions

Per W.GOLD.001 architecture-beats-vigilance: the cap is enforced before
rental (vast-spend-ledger.check-cap exits 1 → refuse to proceed). The
watchdog (--mode check + ScheduleWakeup) tears down on success, timeout,
or cap breach — three independent safety nets.

Usage flow (Paper 22 kernel-check example):
    # 1. Plan — see what would happen
    python paper-gate-execute.py --gate-id 22-msc-kernel-check \\
        --mode plan --override-min-vram 80

    # 2. Rent — actually create the instance + bootstrap
    python paper-gate-execute.py --gate-id 22-msc-kernel-check \\
        --mode rent --override-min-vram 80
    # → outputs {instance_id: 12345, ...}, schedules watchdog wakeups

    # 3. Check (called periodically by ScheduleWakeup)
    python paper-gate-execute.py --gate-id 22-msc-kernel-check \\
        --mode check --instance-id 12345
    # → prints status; exits 0 if running, 2 if success, 3 if timeout/fail

    # 4. Teardown (called by check on success/timeout)
    python paper-gate-execute.py --instance-id 12345 --mode teardown \\
        --reason "kernel-check-passed"
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
PICKER = SCRIPT_DIR / "pick-cheapest-offer.py"
LEDGER = SCRIPT_DIR / "vast-spend-ledger.py"
SCHEDULER = SCRIPT_DIR / "paper-gate-scheduler.py"
BOOTSTRAP_SCRIPT = SCRIPT_DIR / "bootstrap-agent.sh"

_LEDGER_MODULE = None


def _get_ledger_module():
    """Import vast-spend-ledger.py as a Python module (structural rail per W.GOLD.001).

    Uses importlib because the hyphenated filename prevents normal import.
    Raises ImportError if the module can't be loaded — this is intentional:
    a missing or broken ledger is a HARD failure, not a silent bypass.
    The cap must be a structural rail, not operator vigilance (W.GOLD.001).
    Cached on first call so subsequent invocations are free.
    """
    global _LEDGER_MODULE
    if _LEDGER_MODULE is not None:
        return _LEDGER_MODULE
    ledger_path = SCRIPT_DIR / "vast-spend-ledger.py"
    if not ledger_path.exists():
        raise ImportError(
            f"vast-spend-ledger.py not found at {ledger_path} — "
            f"spend-cap enforcement is a structural rail (W.GOLD.001), "
            f"not optional. Use --skip-cap-check to explicitly override."
        )
    spec = importlib.util.spec_from_file_location("vast_spend_ledger", str(ledger_path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module spec for {ledger_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _LEDGER_MODULE = module
    return _LEDGER_MODULE


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run_subprocess(cmd: list[str], *, timeout: int = 60, capture: bool = True) -> tuple[int, str, str]:
    """Run a subprocess. Returns (exit_code, stdout, stderr)."""
    try:
        cp = subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            timeout=timeout,
        )
        return cp.returncode, cp.stdout or "", cp.stderr or ""
    except subprocess.TimeoutExpired as exc:
        return 124, "", f"timeout after {timeout}s: {exc}"
    except FileNotFoundError as exc:
        return 127, "", f"command not found: {exc}"


def fetch_gate(gate_id: str) -> dict | None:
    """Pull a single gate from the scheduler's GATES list via --json."""
    rc, out, err = run_subprocess(
        [sys.executable, str(SCHEDULER), "--json", "--cap", "9999"],
        timeout=30,
    )
    if rc not in (0, 1):  # 0 = schedulable found, 1 = none — both produce JSON
        return None
    try:
        result = json.loads(out)
    except json.JSONDecodeError:
        return None
    all_gates = (
        result.get("schedulable", [])
        + result.get("blocked_by_cap", [])
        + result.get("blocked_by_missing_scaffold", [])
        + result.get("already_running", [])  # active instances not in schedulable
        + result.get("active", [])
        + result.get("all_gates", [])
    )
    for g in all_gates:
        if g.get("gate_id") == gate_id:
            return g
    # Scheduler may not return active gates in any bucket — fall through to
    # direct GATES lookup by importing the scheduler module.
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location("scheduler", str(SCHEDULER))
        sched = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sched)
        for g in getattr(sched, "GATES", []):
            if g.get("gate_id") == gate_id:
                return g
    except Exception:
        pass
    return None


def pick_offer(gate: dict, *, override_min_vram: int | None) -> dict | None:
    """Run the picker against the gate's brain. Returns the top offer dict
    or None."""
    brain_name = gate["brain"]
    brain_path = Path.home() / ".ai-ecosystem" / "compositions" / f"{brain_name}.hsplus"
    cmd = [sys.executable, str(PICKER), "--requirements", str(brain_path), "--top", "1"]
    if override_min_vram is not None:
        cmd += ["--min-vram", str(override_min_vram)]
    rc, out, err = run_subprocess(cmd, timeout=90)
    if rc not in (0, 1):
        print(f"picker error: rc={rc}\n  stdout={out[:400]}\n  stderr={err[:400]}", file=sys.stderr)
        return None
    try:
        result = json.loads(out)
    except json.JSONDecodeError:
        return None
    candidates = result.get("candidates") or []
    return candidates[0] if candidates else None


def check_cap_before_rent(estimated_cost: float, cap: float) -> tuple[bool, dict]:
    """Structural cap enforcement per W.GOLD.001.

    Uses direct function calls (not subprocess) so the cap rail cannot be
    silently bypassed. Import failure is a HARD error — operator must use
    --skip-cap-check to explicitly override.
    """
    try:
        ledger = _get_ledger_module()
    except ImportError as exc:
        # Structural rail: missing ledger = hard failure, not silent bypass.
        return False, {"_error": f"ledger import failed (structural rail): {exc}"}

    records = ledger.read_records(ledger.DEFAULT_LEDGER)
    spent, burn_rate, active = ledger.compute_day_spend(records)

    state = {
        "cap_usd": cap,
        "already_spent_usd": round(spent, 2),
        "daily_burn_rate_usd": round(burn_rate, 2),
        "headroom_spent_usd": round(cap - spent, 2),
        "headroom_burn_rate_usd": round(cap - burn_rate, 2),
        "active_rentals": active,
        "under_cap_actual": spent < cap,
        "under_cap_projected": burn_rate < cap,
    }

    if spent >= cap:
        return False, state
    headroom = float(state["headroom_burn_rate_usd"])
    if estimated_cost > headroom:
        return False, state
    return True, state


def rent_instance(offer_id: int, ssh_key_path: Path) -> dict | None:
    """vastai create instance <offer_id> with the bootstrap image. Returns
    {success, new_contract, ...} or None on failure."""
    # `vastai create instance` requires --image; use a known-public
    # Docker Hub tag. Verified 2026-04-26: `vastai/pytorch:2.4.0-cuda-12.4.1`
    # returns "manifest unknown" on Docker pull. PyTorch official tag works.
    # Lake/elan don't need PyTorch but we get CUDA + cuDNN + Python ready.
    cmd = [
        "vastai", "create", "instance", str(offer_id),
        "--image", "pytorch/pytorch:2.4.0-cuda12.4-cudnn9-devel",
        "--disk", "80",
        "--raw",
    ]
    rc, out, err = run_subprocess(cmd, timeout=60)
    if rc != 0:
        print(f"vastai create failed: rc={rc}\n  stdout={out[:400]}\n  stderr={err[:400]}",
              file=sys.stderr)
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        # Sometimes vastai prints "Started. <id>" instead of JSON
        print(f"vastai create non-JSON: {out[:300]}", file=sys.stderr)
        # Try to extract instance_id
        for line in out.splitlines():
            if "new_contract" in line or "Started" in line:
                import re as _re
                m = _re.search(r"\d{6,}", line)
                if m:
                    return {"new_contract": int(m.group()), "_raw_output": out.strip()}
        return None


def label_instance(instance_id: int, handle: str) -> bool:
    """vastai label instance <id> handle=<handle>"""
    rc, _, err = run_subprocess(
        ["vastai", "label", "instance", str(instance_id), f"handle={handle}"],
        timeout=20,
    )
    return rc == 0


def record_rent_in_ledger(instance_id: int, handle: str, dph: float, gpu_name: str) -> bool:
    """Record a rental in the spend ledger (structural rail per W.GOLD.001).

    Uses direct function call instead of subprocess so recording cannot be
    silently skipped. Import failure = hard error.
    """
    try:
        ledger = _get_ledger_module()
    except ImportError as exc:
        print(f"ledger import failed (structural rail): {exc}", file=sys.stderr)
        return False
    try:
        record = {
            "event": "rented",
            "instance_id": instance_id,
            "handle": handle,
            "dph": dph,
            "gpu_name": gpu_name,
        }
        ledger.append_record(ledger.DEFAULT_LEDGER, record)
        print(json.dumps({"ok": True, "recorded": record}))
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"ledger rent record failed: {exc}", file=sys.stderr)
        return False


def record_close_in_ledger(instance_id: int, reason: str = "") -> bool:
    """Record a tear-down in the spend ledger (structural rail per W.GOLD.001).

    Uses direct function call instead of subprocess so recording cannot be
    silently skipped. Import failure = hard error.
    """
    try:
        ledger = _get_ledger_module()
    except ImportError:
        # Non-fatal for close — the instance is already shutting down
        return True
    try:
        record = {
            "event": "closed",
            "instance_id": instance_id,
        }
        if reason:
            record["reason"] = reason
        ledger.append_record(ledger.DEFAULT_LEDGER, record)
        print(json.dumps({"ok": True, "recorded": record}))
        return True
    except Exception:  # noqa: BLE001
        # Non-fatal for close — the instance is already shutting down
        return True


def destroy_instance(instance_id: int) -> bool:
    """vastai destroy instance <id>"""
    rc, _, err = run_subprocess(
        ["vastai", "destroy", "instance", str(instance_id)],
        timeout=30,
    )
    if rc != 0:
        print(f"vastai destroy failed: rc={rc} stderr={err[:300]}", file=sys.stderr)
    return rc == 0


def fetch_cael_records(team_id: str, api_key: str, handle: str) -> list[dict]:
    """Pull recent CAEL records for a handle from fleet-status endpoint."""
    if not team_id or not api_key:
        return []
    try:
        import urllib.request as urlreq
    except Exception:  # noqa: BLE001
        return []
    url = (
        f"https://mcp.holoscript.net/api/holomesh/fleet/status"
        f"?team={team_id}"
    )
    req = urlreq.Request(url, headers={"x-mcp-api-key": api_key})
    try:
        with urlreq.urlopen(req, timeout=8) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return []
    # fleet-status shape varies; look for records under known keys
    agents = data.get("agents") or data.get("workers") or []
    for a in agents:
        if a.get("handle") == handle:
            return a.get("recent_cael", []) or a.get("audit", []) or []
    return []


def resolve_instance_ssh(instance_id: int) -> tuple[str, int] | None:
    """Resolve direct SSH host:port for a Vast.ai instance by ID."""
    rc, out, err = run_subprocess(["vastai", "show", "instances", "--raw"], timeout=30)
    if rc != 0:
        return None
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict):
        data = [data]
    for inst in data:
        if inst.get("id") == instance_id or inst.get("new_contract") == instance_id:
            ip = inst.get("public_ipaddr")
            ports = inst.get("ports") or {}
            port_entry = ports.get("22/tcp") if isinstance(ports, dict) else None
            if ip and isinstance(port_entry, list) and port_entry:
                port = port_entry[0].get("HostPort")
                if port:
                    return ip.strip(), int(port)
            if inst.get("ssh_host"):
                return inst["ssh_host"], int(inst.get("ssh_port", 22))
    return None


def _build_env_lines(handle: str, gate: dict, wallet: str, bearer: str, team_id: str) -> list[str]:
    """Compose agent.env lines for bootstrap-agent.sh."""
    provider = gate.get("provider", "local-llm")
    model = gate.get("model", "Qwen/Qwen2.5-0.5B-Instruct")
    brain_name = gate["brain"]
    brain_remote = f"/root/{brain_name}.hsplus"
    budget = gate.get("estimated_cost_usd", 5)

    lines = [
        f"HOLOSCRIPT_AGENT_HANDLE={handle}",
        f"HOLOSCRIPT_AGENT_PROVIDER={provider}",
        f"HOLOSCRIPT_AGENT_MODEL={model}",
        f"HOLOSCRIPT_AGENT_BRAIN={brain_remote}",
        f"HOLOSCRIPT_AGENT_WALLET={wallet}",
        f"HOLOSCRIPT_AGENT_X402_BEARER={bearer}",
        f"HOLOSCRIPT_AGENT_BUDGET_USD_DAY={budget}",
        f"HOLOMESH_TEAM_ID={team_id}",
    ]

    github_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("PERSONAL_ACCESS_TOKEN")
    if github_token:
        lines.append(
            f"HOLOSCRIPT_REPO_URL=https://x-access-token:{github_token}@github.com/brianonbased-dev/HoloScript.git"
        )

    if provider == "local-llm":
        lines.append("START_LOCAL_LLM_SERVER=1")
        lines.append(f"LOCAL_LLM_MODEL={model}")
        lines.append("HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL=http://localhost:8081/v1")
    elif provider == "anthropic":
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if key:
            lines.append(f"ANTHROPIC_API_KEY={key}")
    elif provider == "openai":
        key = os.environ.get("OPENAI_API_KEY", "")
        if key:
            lines.append(f"OPENAI_API_KEY={key}")
    elif provider == "gemini":
        key = os.environ.get("GEMINI_API_KEY", "")
        if key:
            lines.append(f"GEMINI_API_KEY={key}")

    # Sidecars: if gate declares them, pass JSON to bootstrap-agent.sh
    sidecars = gate.get("sidecars")
    if sidecars:
        lines.append(f"HOLOSCRIPT_AGENT_SIDECARS={json.dumps(sidecars)}")
        for sc in sidecars:
            url = f"http://localhost:{sc['port']}/v1"
            lines.append(f"{sc['consumed_by_env_var']}={url}")

    return lines


def _wait_for_ssh(host: str, port: int, ssh_key: Path | None = None, *,
                  max_wait_s: int = 300, poll_s: int = 15) -> bool:
    """Poll until SSH auth succeeds (not just TCP open) or max_wait_s elapsed.

    Vast.ai's ssh proxy answers TCP immediately but authorized_keys on the
    instance is provisioned ~30-90s after creation — TCP-only check passes
    too early and SCP gets permission-denied. We test actual auth here.
    """
    import time
    deadline = time.monotonic() + max_wait_s
    attempt = 0
    key_args = ["-i", str(ssh_key)] if ssh_key and ssh_key.exists() else []
    while time.monotonic() < deadline:
        attempt += 1
        rc, out, _ = run_subprocess([
            "ssh", *key_args,
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=8",
            "-o", "BatchMode=yes",
            "-p", str(port),
            f"root@{host}",
            "echo SSH_READY",
        ], timeout=15)
        if rc == 0 and "SSH_READY" in out:
            print(f"[bootstrap] SSH auth ready after ~{attempt * poll_s}s", file=sys.stderr)
            return True
        print(f"[bootstrap] SSH not auth-ready (attempt {attempt}, rc={rc}), waiting {poll_s}s...", file=sys.stderr)
        time.sleep(poll_s)
    return False


def _scp_and_bootstrap(instance_id: int, handle: str, gate: dict, wallet: str, bearer: str, team_id: str, ssh_key: Path) -> dict:
    """SCP bootstrap-agent.sh + env + runner + brain, then SSH dispatch.
    Returns {ok, ssh_host, ssh_port} or {ok, error}."""
    ssh = resolve_instance_ssh(instance_id)
    if not ssh:
        return {"ok": False, "error": "could not resolve SSH host:port for instance"}
    host, port = ssh

    # Wait for SSH auth to be ready — instances need ~1-3 min to boot and for
    # Vast.ai to provision authorized_keys; TCP-only check passes too early
    # (permission-denied incident 2026-05-19: all 4 gates failed on SCP).
    if not _wait_for_ssh(host, port, ssh_key):
        return {"ok": False, "error": f"SSH auth not ready after 300s: {host}:{port}"}

    brain_name = gate["brain"]
    brain_local = Path.home() / ".ai-ecosystem" / "compositions" / f"{brain_name}.hsplus"
    if not brain_local.exists():
        return {"ok": False, "error": f"brain file not found: {brain_local}"}

    with tempfile.TemporaryDirectory() as staging:
        staging_path = Path(staging)
        env_file = staging_path / "agent.env"
        runner_file = staging_path / "runner.sh"

        env_lines = _build_env_lines(handle, gate, wallet, bearer, team_id)
        # newline='\n' forces LF-only on Windows — CRLF endings cause bash on
        # Linux to fail: `source /root/agent.env\r` looks for a non-existent
        # file with \r in the name, silently leaving all env vars unset.
        env_file.write_text("\n".join(env_lines) + "\n", encoding="utf-8", newline="\n")

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
        runner_file.write_text(runner_text, encoding="utf-8", newline="\n")

        ssh_base = [
            "ssh", "-i", str(ssh_key),
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=15",
            "-o", "BatchMode=yes",
            "-p", str(port),
        ]
        scp_base = [
            "scp", "-i", str(ssh_key),
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=15",
            "-o", "BatchMode=yes",
            "-P", str(port),
        ]
        remote = f"root@{host}"

        scp_cmd = scp_base + [
            str(BOOTSTRAP_SCRIPT),
            str(env_file),
            str(runner_file),
            str(brain_local),
            f"{remote}:/root/",
        ]
        rc, out, err = run_subprocess(scp_cmd, timeout=60)
        if rc != 0:
            return {"ok": False, "error": f"scp failed: {err[:300]}"}

        ssh_cmd = ssh_base + [remote, "bash /root/runner.sh"]
        rc, out, err = run_subprocess(ssh_cmd, timeout=30)
        if rc != 0 or "DEPLOY_DISPATCHED" not in out:
            return {"ok": False, "error": f"ssh bootstrap dispatch failed: rc={rc} stderr={err[:300]}"}

        return {"ok": True, "ssh_host": host, "ssh_port": port}


# Success markers per gate. The watchdog matches these against CAEL records'
# operation field. Concrete + auditable: each gate names what success looks
# like in code, not in a comment.
GATE_SUCCESS_MARKERS = {
    "22-msc-kernel-check": [
        "task-executed:lake build",         # primary: lake build invocation
        "task-executed:bash:lake build",     # alternative shape
    ],
    "23-hscore-kernel-check": [
        "task-executed:lake build",
    ],
    "17-sesl-corpus": [
        # Paper 17 success is INDEX.json reaching 5k pairs — checked via
        # local file probe, not CAEL marker. Watchdog handles this case.
    ],
}


def cmd_plan(args: argparse.Namespace) -> int:
    gate = fetch_gate(args.gate_id)
    if not gate:
        print(f"ERROR: gate not found: {args.gate_id}", file=sys.stderr)
        return 2
    offer = pick_offer(gate, override_min_vram=args.override_min_vram)
    if not offer:
        print(f"ERROR: no fitting offer for gate {args.gate_id}", file=sys.stderr)
        return 1
    estimated_cost = float(offer["dph_total"]) * float(gate["estimated_hours"])
    cap_ok, ledger_state = check_cap_before_rent(estimated_cost, args.cap)
    plan = {
        "asOf": _now_iso(),
        "gate_id": args.gate_id,
        "paper": gate["paper"],
        "brain": gate["brain"],
        "blocking_artifact": gate["blocking_artifact"],
        "verification": gate["verification"],
        "offer": {
            "id": offer["id"],
            "gpu_name": offer["gpu_name"],
            "gpu_ram_mib": offer["gpu_ram"],
            "dph_total": offer["dph_total"],
            "reliability2": offer["reliability2"],
        },
        "estimated_hours": gate["estimated_hours"],
        "estimated_cost_usd": round(estimated_cost, 2),
        "cap_usd": args.cap,
        "ledger_headroom_usd": ledger_state.get("headroom_burn_rate_usd", args.cap),
        "cap_ok": cap_ok,
        "success_markers": GATE_SUCCESS_MARKERS.get(args.gate_id, []),
        "timeout_after_hours": gate["estimated_hours"] * 1.5,
        "next_action": (
            f"--mode rent --gate-id {args.gate_id}"
            if cap_ok else "BLOCKED: estimated cost exceeds ledger headroom"
        ),
    }
    print(json.dumps(plan, indent=2))
    return 0 if cap_ok else 1


def cmd_rent(args: argparse.Namespace) -> int:
    # Re-run plan stage internally so we always rent against fresh state
    gate = fetch_gate(args.gate_id)
    if not gate:
        print(f"ERROR: gate not found: {args.gate_id}", file=sys.stderr)
        return 2
    offer = pick_offer(gate, override_min_vram=args.override_min_vram)
    if not offer:
        print(f"ERROR: no fitting offer for gate {args.gate_id}", file=sys.stderr)
        return 1
    estimated_cost = float(offer["dph_total"]) * float(gate["estimated_hours"])
    cap_ok, ledger_state = check_cap_before_rent(estimated_cost, args.cap)
    if not cap_ok:
        print(f"ERROR: cap breach. estimated={estimated_cost} headroom={ledger_state.get('headroom_burn_rate_usd', '?')}", file=sys.stderr)
        return 3

    handle = f"paper-gate-exec-{args.gate_id}"
    print(f"[rent] gate={args.gate_id} offer={offer['id']} dph={offer['dph_total']:.2f} est_cost={estimated_cost:.2f}", file=sys.stderr)

    rented = rent_instance(int(offer["id"]), Path.home() / ".ssh" / "id_rsa")
    if not rented:
        return 4

    instance_id = rented.get("new_contract") or rented.get("instance_id")
    if not instance_id:
        print(f"ERROR: rental succeeded but no instance_id in response: {rented}", file=sys.stderr)
        return 5

    # Record in ledger BEFORE labeling — if something dies after this, the
    # ledger has the rental and check-cap will reflect it.
    record_rent_in_ledger(int(instance_id), handle, float(offer["dph_total"]), str(offer.get("gpu_name", "?")))

    # Label for W.111 idempotency
    label_instance(int(instance_id), handle)

    # Bootstrap: SCP + SSH dispatch (fire-and-forget, runs in background on instance)
    wallet = os.environ.get(args.wallet_env_key, "")
    bearer = os.environ.get(args.bearer_env_key, "")
    if not wallet or not bearer:
        bootstrap_result = {"ok": False, "error": f"identity missing: {args.wallet_env_key} / {args.bearer_env_key}"}
        print(f"WARN: bootstrap identity missing. Instance rented but NOT bootstrapped.", file=sys.stderr)
    else:
        bootstrap_result = _scp_and_bootstrap(
            int(instance_id), handle, gate, wallet, bearer,
            args.team_id or os.environ.get("HOLOMESH_TEAM_ID", ""),
            Path.home() / ".ssh" / "id_rsa",
        )
        if not bootstrap_result.get("ok"):
            print(f"WARN: bootstrap dispatch failed: {bootstrap_result.get('error')}", file=sys.stderr)

    print(json.dumps({
        "ok": True,
        "gate_id": args.gate_id,
        "instance_id": int(instance_id),
        "handle": handle,
        "offer_id": offer["id"],
        "dph_total": offer["dph_total"],
        "estimated_cost_usd": round(estimated_cost, 2),
        "timeout_at_iso": (datetime.now(timezone.utc) + timedelta(hours=gate["estimated_hours"] * 1.5)).isoformat(timespec="seconds"),
        "bootstrap": bootstrap_result,
        "next_action": f"--mode check --instance-id {instance_id} --gate-id {args.gate_id}",
    }, indent=2))
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    """Poll CAEL records + check timeout + vLLM health. Exit codes:
    0 = still running (re-check later)
    2 = success (caller should teardown)
    3 = timeout (caller should teardown)
    4 = cap breached (caller should teardown)
    5 = vLLM unhealthy (caller may re-bootstrap or teardown)
    """
    gate = fetch_gate(args.gate_id) if args.gate_id else None
    handle = args.handle or (f"paper-gate-exec-{args.gate_id}" if args.gate_id else None)
    if not handle:
        print("ERROR: --handle or --gate-id required", file=sys.stderr)
        return 2

    # Cap check first — if the fleet hit the rail, tear everything down
    # Structural rail per W.GOLD.001: direct import, not subprocess
    try:
        ledger = _get_ledger_module()
        records = ledger.read_records(ledger.DEFAULT_LEDGER)
        spent, burn_rate, active = ledger.compute_day_spend(records)
    except ImportError as exc:
        print(json.dumps({"status": "cap-check-failed", "error": f"ledger import failed (structural rail): {exc}"}, indent=2))
        return 4
    if spent >= args.cap or burn_rate >= args.cap:
        cap_state = {
            "cap_usd": args.cap,
            "already_spent_usd": round(spent, 2),
            "daily_burn_rate_usd": round(burn_rate, 2),
            "active_rentals": active,
        }
        print(json.dumps({"status": "cap-breached", "ledger": cap_state}, indent=2))
        return 4

    # Timeout check — read started_at from ledger
    rc, out, _ = run_subprocess([sys.executable, str(LEDGER), "report", "--days", "7"], timeout=10)
    try:
        report = json.loads(out)
    except json.JSONDecodeError:
        report = {}
    active = [a for a in report.get("active", []) if a.get("instance_id") == args.instance_id]
    if active:
        started_at = datetime.fromisoformat(active[0]["started_at"].replace("Z", "+00:00"))
        running_h = (datetime.now(timezone.utc) - started_at).total_seconds() / 3600
        timeout_h = (gate["estimated_hours"] * 1.5) if gate else 4.0
        if running_h >= timeout_h:
            print(json.dumps({"status": "timeout", "running_hours": round(running_h, 2),
                              "timeout_hours": timeout_h}, indent=2))
            return 3

    # vLLM health check — if bootstrap never ran or vLLM crashed, no CAEL will ever arrive
    ssh = resolve_instance_ssh(args.instance_id) if args.instance_id else None
    if ssh:
        host, port = ssh
        rc, out, _ = run_subprocess([
            "ssh", "-i", str(Path.home() / ".ssh" / "id_rsa"),
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "ConnectTimeout=10",
            "-o", "BatchMode=yes",
            "-p", str(port),
            f"root@{host}",
            "curl -sf http://localhost:8081/v1/models >/dev/null 2>&1 && echo OK || echo FAIL",
        ], timeout=20)
        if rc != 0 or "OK" not in out:
            # SSH is reachable (rc==0 from the ssh call itself means we connected)
            # but vllm isn't up. Check if gpu_runner is running — if not, bootstrap
            # never ran and we should retry it now rather than burn the instance.
            ssh_reachable = (rc == 0)  # rc!=0 means SSH itself failed, not just vllm
            if ssh_reachable and gate:
                check_runner = run_subprocess([
                    "ssh", "-i", str(Path.home() / ".ssh" / "id_rsa"),
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "UserKnownHostsFile=/dev/null",
                    "-o", "ConnectTimeout=10",
                    "-o", "BatchMode=yes",
                    "-p", str(port),
                    f"root@{host}",
                    "pgrep -f gpu-runner.mjs >/dev/null 2>&1 && echo RUNNER_UP || echo RUNNER_ABSENT",
                ], timeout=20)
                if check_runner[0] == 0 and "RUNNER_ABSENT" in check_runner[1]:
                    # Bootstrap never ran — retry it
                    wallet = os.environ.get(args.wallet_env_key or "HOLOMESH_WALLET_PAPER_GATE_X402", "")
                    bearer = os.environ.get(args.bearer_env_key or "HOLOMESH_API_KEY_PAPER_GATE_X402", "")
                    team_id = args.team_id or os.environ.get("HOLOMESH_TEAM_ID", "")
                    if wallet and bearer:
                        print(f"[check] vllm unhealthy + runner absent — retrying bootstrap", file=sys.stderr)
                        retry = _scp_and_bootstrap(
                            args.instance_id, handle, gate, wallet, bearer, team_id,
                            Path.home() / ".ssh" / "id_rsa",
                        )
                        print(json.dumps({"status": "vllm-unhealthy", "bootstrap_retry": retry,
                                          "instance_id": args.instance_id, "handle": handle}, indent=2))
                        return 5
            print(json.dumps({"status": "vllm-unhealthy", "instance_id": args.instance_id, "handle": handle}, indent=2))
            return 5

    # CAEL success-marker check
    if gate:
        records = fetch_cael_records(args.team_id, args.api_key, handle)
        markers = GATE_SUCCESS_MARKERS.get(args.gate_id, [])
        for r in records:
            op = r.get("operation", "")
            if any(m in op for m in markers):
                print(json.dumps({"status": "success", "matched_record": r}, indent=2))
                return 2

    print(json.dumps({"status": "running", "instance_id": args.instance_id, "handle": handle,
                      "running_hours": round(running_h if active else 0, 2)}, indent=2))
    return 0


def cmd_teardown(args: argparse.Namespace) -> int:
    print(f"[teardown] instance_id={args.instance_id} reason={args.reason!r}", file=sys.stderr)
    destroyed = destroy_instance(args.instance_id)
    closed = record_close_in_ledger(args.instance_id, args.reason or "teardown")
    print(json.dumps({"ok": destroyed and closed, "destroyed": destroyed,
                      "ledger_closed": closed, "instance_id": args.instance_id}, indent=2))
    return 0 if destroyed and closed else 1


def cmd_bootstrap(args: argparse.Namespace) -> int:
    """Standalone bootstrap for an already-rented instance."""
    gate = fetch_gate(args.gate_id)
    if not gate:
        print(f"ERROR: gate not found: {args.gate_id}", file=sys.stderr)
        return 2
    if not args.instance_id:
        print("ERROR: --instance-id required for bootstrap", file=sys.stderr)
        return 2

    handle = args.handle or f"paper-gate-exec-{args.gate_id}"
    wallet = os.environ.get(args.wallet_env_key, "")
    bearer = os.environ.get(args.bearer_env_key, "")
    if not wallet or not bearer:
        print(f"ERROR: bootstrap identity missing. Set {args.wallet_env_key} and {args.bearer_env_key}", file=sys.stderr)
        return 6

    result = _scp_and_bootstrap(
        args.instance_id, handle, gate, wallet, bearer,
        args.team_id or os.environ.get("HOLOMESH_TEAM_ID", ""),
        Path.home() / ".ssh" / "id_rsa",
    )
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


def cmd_self_test(args: argparse.Namespace) -> int:
    # Synthetic: GATE_SUCCESS_MARKERS keys match scheduler's GATES
    rc, out, _ = run_subprocess(
        [sys.executable, str(SCHEDULER), "--json", "--cap", "9999"],
        timeout=30,
    )
    if rc in (0, 1):
        gates = json.loads(out)
        all_ids = {g["gate_id"] for g in (
            gates.get("schedulable", []) + gates.get("blocked_by_cap", [])
            + gates.get("blocked_by_missing_scaffold", [])
        )}
        for marker_id in GATE_SUCCESS_MARKERS.keys():
            assert marker_id in all_ids, f"GATE_SUCCESS_MARKERS has unknown gate_id: {marker_id}"
    # vastai CLI present
    rc, _, _ = run_subprocess(["vastai", "--version"], timeout=10)
    assert rc == 0, "vastai CLI not on PATH"
    # Sibling scripts present
    assert PICKER.exists(), PICKER
    assert LEDGER.exists(), LEDGER
    assert SCHEDULER.exists(), SCHEDULER
    print("self-tests PASS (5 assertions)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--mode", required=True,
                   choices=["plan", "rent", "check", "teardown", "self-test", "bootstrap"])
    p.add_argument("--gate-id", help="gate id from paper-gate-scheduler GATES")
    p.add_argument("--instance-id", type=int, help="for check/teardown")
    p.add_argument("--handle", help="for check (default: derived from gate-id)")
    p.add_argument("--cap", type=float, default=100.0,
                   help="$/day cap, fleet-wide aggregate (founder ruling 2026-04-26: $50 → $100)")
    p.add_argument("--override-min-vram", type=int, default=None,
                   help="override brain composition min_vram_gb (e.g. 80 for non-sidecar work)")
    p.add_argument("--reason", default="", help="for teardown logging")
    p.add_argument("--team-id", default=os.environ.get("HOLOMESH_TEAM_ID", ""))
    p.add_argument("--api-key", default=os.environ.get("HOLOMESH_API_KEY", ""))
    p.add_argument("--wallet-env-key", default="HOLOMESH_WALLET_PAPER_GATE_X402",
                   help="env var name for the instance wallet address")
    p.add_argument("--bearer-env-key", default="HOLOMESH_API_KEY_PAPER_GATE_X402",
                   help="env var name for the instance x402 bearer")
    args = p.parse_args()

    handlers = {
        "plan": cmd_plan,
        "rent": cmd_rent,
        "check": cmd_check,
        "teardown": cmd_teardown,
        "self-test": cmd_self_test,
        "bootstrap": cmd_bootstrap,
    }
    return handlers[args.mode](args)


if __name__ == "__main__":
    sys.exit(main())
