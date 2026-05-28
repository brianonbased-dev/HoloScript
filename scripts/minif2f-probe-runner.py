#!/usr/bin/env python3
"""miniF2F Probe Runner v2 — Fixed prompt format for instruction-tuned models.

Pipeline per problem:
  1. LOAD    -- read problem from JSON manifest or fall back to .lean file
  2. SCAFFOLD -- generate tactic sketch via Qwen-72B-AWQ or Goedel sidecar
  3. CLOSE   -- iterate: scaffold -> lake-verify -> on failure, feed error back
  4. LAKE-VERIFY -- lake env lean checks kernel acceptance
  5. AGGREGATE -- compute pass@1, pass@10, pass@N; write receipt JSON

CLI:
  python3 scripts/minif2f-probe-runner.py --problems-json=scripts/fixtures/minif2f-sample-10.json
  python3 scripts/minif2f-probe-runner.py --no-sidecar  # Qwen-only baseline
  python3 scripts/minif2f-probe-runner.py --dry-run     # parse + plan only

Exit codes:
  0  pass@10 >= target (AMBER -> GREEN)
  1  pass@10 < target (AMBER -> RED)
  2  fleet/sidecar unreachable
  3  invalid CLI / missing env
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ─── CLI ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="miniF2F probe runner v2")
parser.add_argument("--n", type=int, default=10, help="Number of problems")
parser.add_argument("--target-pass-at-10", type=float, default=0.5)
parser.add_argument("--max-iters", type=int, default=10, help="Max iterations per problem")
parser.add_argument("--problems-json", type=str, default=None)
parser.add_argument("--lean-project", type=str, default="/root/miniF2F-lean4")
parser.add_argument("--main-url", type=str, default="http://127.0.0.1:8081")
parser.add_argument("--sidecar-url", type=str, default="http://127.0.0.1:8082")
parser.add_argument("--no-sidecar", action="store_true")
parser.add_argument("--dry-run", action="store_true")
parser.add_argument("--verbose", action="store_true")
parser.add_argument("--receipt-dir", type=str, default="/root/probe-results")
parser.add_argument("--main-model", type=str, default=None)
parser.add_argument("--sidecar-model", type=str, default=None)
args = parser.parse_args()

# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(*msgs):
    print(f"[probe] {' '.join(str(m) for m in msgs)}", file=sys.stderr, flush=True)

def vlog(*msgs):
    if args.verbose:
        log(*msgs)

# ─── Problem Set Loader ──────────────────────────────────────────────────────

def load_problems():
    """Load problems from JSON or from .lean files in the miniF2F project."""
    if not args.problems_json:
        log("FATAL: --problems-json required")
        sys.exit(3)

    path = Path(args.problems_json)
    if not path.exists():
        log(f"FATAL: --problems-json path not found: {path}")
        sys.exit(3)

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ValueError) as exc:
        log(f"FATAL: --problems-json is not valid JSON: {exc}")
        sys.exit(3)
    if not isinstance(raw, list):
        log("FATAL: --problems-json must be a JSON array")
        sys.exit(3)

    valid = [p for p in raw if isinstance(p, dict) and "id" in p and "statement" in p]
    if len(valid) < args.n:
        log(f"WARN: requested N={args.n} but only {len(valid)} valid problems")

    return valid[:args.n], str(path)

# ─── Health Checks ────────────────────────────────────────────────────────────

import urllib.request
import urllib.error

def probe_health(url, label, timeout=10):
    try:
        req = urllib.request.Request(f"{url}/v1/models")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
            model_id = data.get("data", [{}])[0].get("id", "(no model)")
            return {"ok": True, "model_id": model_id, "label": label}
    except Exception as e:
        return {"ok": False, "error": str(e), "label": label}

# ─── LLM Call ─────────────────────────────────────────────────────────────────

def llm_chat_complete(url, messages, model=None, max_tokens=1024, temperature=0.7, timeout=120):
    """Use chat completions endpoint for instruction-tuned models."""
    body = {
        "model": model or "auto",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/v1/chat/completions",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
            return result.get("choices", [{}])[0].get("message", {}).get("content", "")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:200]
        # Fall back to completions endpoint if chat completions not available
        log(f"  chat completions failed ({e.code}), falling back to completions")
        return llm_complete(url, messages[-1]["content"], model=model, max_tokens=max_tokens, temperature=temperature, timeout=timeout)
    except Exception as e:
        log(f"  chat complete error: {e}")
        return ""

def llm_complete(url, prompt, model=None, max_tokens=1024, temperature=0.7, timeout=120):
    """Use raw completions endpoint."""
    body = {
        "model": model or "auto",
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stop": ["\n```", "\n--", "\n\ntheorem", "\n\nlemma"],
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/v1/completions",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            result = json.loads(resp.read())
            return result.get("choices", [{}])[0].get("text", "")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"LLM {url} returned {e.code}: {body_text}")
    except Exception as e:
        raise RuntimeError(f"LLM {url} error: {e}")

# ─── Lean Kernel Check ───────────────────────────────────────────────────────

def lean_file_check(lean_content, problem_id, project_dir, iteration):
    """Write Lean content to a probe file and check with lake env lean."""
    probe_dir = Path(project_dir) / "Probe"
    probe_dir.mkdir(parents=True, exist_ok=True)

    safe_id = problem_id.replace("/", "_").replace("\\", "_")
    lean_path = probe_dir / f"{safe_id}_iter{iteration}.lean"
    lean_path.write_text(lean_content, encoding="utf-8")

    result = subprocess.run(
        ["lake", "env", "lean", "--threads=1", str(lean_path)],
        cwd=project_dir,
        capture_output=True,
        text=True,
        timeout=120,
        env={**os.environ, "PATH": f"{os.environ.get('PATH', '')}:{os.path.expanduser('~/.elan/bin')}"},
    )
    return {
        "ok": result.returncode == 0,
        "output": (result.stderr + result.stdout)[-8192:],
        "exit_code": result.returncode,
        "lean_path": str(lean_path),
    }

# ─── Prompt Engineering ──────────────────────────────────────────────────────

def build_sidecar_prompt(theorem_stmt, lean_file_content, last_error=None):
    """Build prompt for Goedel-Prover-V2-8B sidecar.

    Goedel is a Lean 4 proof model. It works best with the full Lean file context
    where it fills in the proof after `sorry`.
    """
    # Use chat format for Goedel (it's instruction-tuned on Qwen3-8B)
    system_msg = "You are an expert Lean 4 theorem prover. Generate complete, correct proof tactics. Use Mathlib tactics: rfl, simp, omega, decide, linarith, ring, norm_num, induction, aesop, positivity, field_simp, nlinarith, contrapose, by_contra, exact, refine, calc, rcases, obtain, have, constructor, left, right, etc."

    if last_error:
        user_msg = f"""Complete this Lean 4 proof. The previous attempt had this error:
{last_error[-1500:]}

Fix the error and provide the correct proof body.

```lean
{lean_file_content.replace(':= by sorry', ':= by')}
```

Provide ONLY the proof tactics (everything after `:= by`). Do NOT include the theorem statement."""
    else:
        user_msg = f"""Complete this Lean 4 proof by providing the proof body after `:= by`.

```lean
{lean_file_content.replace(':= by sorry', ':= by')}
```

Provide ONLY the proof tactics (everything after `:= by`). Do NOT include the theorem statement. Use Mathlib tactics."""

    return [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]

def build_main_prompt(theorem_stmt, lean_file_content, last_error=None):
    """Build prompt for Qwen-14B main model.

    Qwen-14B-Instruct works best with clear instructions and chat format.
    """
    system_msg = "You are an expert Lean 4 theorem prover. Generate complete, correct proof tactics using Mathlib."

    if last_error:
        user_msg = f"""I need you to prove this Lean 4 theorem. A previous attempt failed with this error:
{last_error[-1500:]}

Here is the theorem to prove:
```lean
{lean_file_content.replace(':= by sorry', ':= by')}
```

Provide the proof tactics after `:= by`. Use Mathlib tactics like rfl, simp, omega, decide, linarith, ring, norm_num, induction, exact, refine, calc, rcases, obtain, have, constructor, etc."""
    else:
        user_msg = f"""Prove this Lean 4 theorem. Provide ONLY the proof body (tactics after `:= by`).

```lean
{lean_file_content.replace(':= by sorry', ':= by')}
```

Use Mathlib tactics: rfl, simp, omega, decide, linarith, ring, norm_num, induction, exact, refine, calc, rcases, obtain, have, constructor, left, right, aesop, etc."""

    return [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]

def read_lean_problem(problem_id, project_dir):
    """Read the original .lean file for a problem from the miniF2F project."""
    lean_path = Path(project_dir) / "MiniF2F" / "Test" / f"{problem_id}.lean"
    if lean_path.exists():
        return lean_path.read_text(encoding="utf-8")
    return None

# ─── Per-Problem Inner Loop ──────────────────────────────────────────────────

def probe_one(problem, ctx):
    out = {
        "id": problem["id"],
        "expected_difficulty": problem.get("expected_difficulty"),
        "iters": [],
        "closed_at_iter": None,
        "pass_1": False,
        "pass_10": False,
        "pass_total": False,
        "final_route": None,
        "final_lean_path": None,
    }

    if args.dry_run:
        out["iters"].append({"iter": 0, "route": "dry-run", "lean_ok": True, "dry_run": True})
        out["closed_at_iter"] = 0
        out["pass_1"] = out["pass_10"] = out["pass_total"] = True
        return out

    # Read the original .lean file
    lean_file_content = read_lean_problem(problem["id"], args.lean_project)
    if lean_file_content is None:
        # Fall back to the statement from the JSON
        lean_file_content = f"""import Mathlib

set_option maxHeartbeats 0

open BigOperators Real Nat Topology Rat

{problem['statement']} sorry"""

    last_error = None

    for iteration in range(args.max_iters):
        # §7.5 dispatch — sidecar by default, main if --no-sidecar or sidecar-down
        route = "main"
        url = args.main_url
        model = args.main_model
        prompt_fn = build_main_prompt

        if not args.no_sidecar and ctx.get("sidecar_ok"):
            route = "sidecar"
            url = args.sidecar_url
            model = args.sidecar_model
            prompt_fn = build_sidecar_prompt

        # Build prompt using chat format
        messages = prompt_fn(problem["statement"], lean_file_content, last_error)

        # LLM completion via chat completions
        try:
            completion = llm_chat_complete(url, messages, model=model, max_tokens=1024, temperature=0.7)
        except Exception as e:
            vlog(f"iter {iteration} llm fail ({route}): {e}")
            if route == "sidecar":
                ctx["sidecar_ok"] = False
            out["iters"].append({
                "iter": iteration, "route": route,
                "lean_ok": False, "exit_code": -1, "llm_error": str(e)[:200]
            })
            continue

        if not completion.strip():
            vlog(f"iter {iteration} empty completion ({route})")
            out["iters"].append({
                "iter": iteration, "route": route,
                "lean_ok": False, "exit_code": -1, "llm_error": "empty completion"
            })
            continue

        # Clean up the completion — remove markdown code fences, extract just the proof
        proof = completion.strip()
        # Remove markdown code fences
        if proof.startswith("```lean"):
            proof = proof[7:]
        elif proof.startswith("```"):
            proof = proof[3:]
        if proof.endswith("```"):
            proof = proof[:-3]
        proof = proof.strip()

        # If the completion includes the theorem statement, extract just the proof body
        if ":= by" in proof:
            # The model gave us the full theorem — extract just the proof after ":= by"
            idx = proof.index(":= by")
            proof = proof[idx + 6:].strip()

        # Build Lean source — use the original file format with our proof
        # Replace `sorry` with the generated proof
        if "sorry" in lean_file_content:
            lean_src = lean_file_content.replace(":= by sorry", f":= by\n  {proof}", 1)
        else:
            # Fallback: construct from statement
            lean_src = f"""-- probe: {problem['id']}  iter {iteration}  route {route}
import Mathlib

set_option maxHeartbeats 0

open BigOperators Real Nat Topology Rat

{problem['statement']}
  {proof}
"""

        # Check with Lean
        k = lean_file_check(lean_src, problem["id"], args.lean_project, iteration)
        iter_rec = {
            "iter": iteration, "route": route,
            "lean_ok": k["ok"],
            "exit_code": k["exit_code"],  # always present for per-problem audit trail
        }
        if not k["ok"]:
            iter_rec["error_excerpt"] = k["output"][-2048:]
        out["iters"].append(iter_rec)

        if k["ok"]:
            out["closed_at_iter"] = iteration
            out["pass_1"] = iteration == 0
            out["pass_10"] = iteration < 10
            out["pass_total"] = True
            out["final_route"] = route
            out["final_lean_path"] = k["lean_path"]
            vlog(f"  {problem['id']} closed at iter={iteration} route={route}")
            return out

        last_error = k["output"]
        vlog(f"  iter {iteration} failed ({route}), retrying...")

    vlog(f"  {problem['id']} did not close in {args.max_iters} iters")
    return out

# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    log(f"config: n={args.n} target=pass@10>={args.target_pass_at_10} max-iters={args.max_iters}")
    log(f"urls: main={args.main_url}  sidecar={args.sidecar_url}  no-sidecar={args.no_sidecar}")
    log(f"lean-project={args.lean_project}  dry-run={args.dry_run}")

    problems, source = load_problems()
    log(f"problems loaded: n={len(problems)} source={source}")

    if not problems:
        log("FATAL: no problems to probe")
        sys.exit(3)

    # Health probe
    ctx = {"main_ok": False, "sidecar_ok": False, "main_health": None, "sidecar_health": None}

    if not args.dry_run:
        ctx["main_health"] = probe_health(args.main_url, "main")
        ctx["main_ok"] = ctx["main_health"]["ok"]
        if not args.no_sidecar:
            ctx["sidecar_health"] = probe_health(args.sidecar_url, "sidecar")
            ctx["sidecar_ok"] = ctx["sidecar_health"]["ok"]

        main_model = ctx["main_health"].get("model_id", "?") if ctx["main_ok"] else "DOWN"
        side_model = ctx["sidecar_health"].get("model_id", "?") if ctx["sidecar_ok"] else ("skipped" if args.no_sidecar else "DOWN")
        log(f"health: main={main_model}  sidecar={side_model}")

        if not ctx["main_ok"]:
            log("FATAL: main LLM unreachable — cannot probe. Re-run when fleet is up.")
            sys.exit(2)

        # Update model names from health check
        if not args.main_model and ctx["main_health"]["ok"]:
            args.main_model = ctx["main_health"]["model_id"]
        if not args.sidecar_model and ctx.get("sidecar_health", {}).get("ok"):
            args.sidecar_model = ctx["sidecar_health"]["model_id"]

    # Run probes
    results = []
    for i, p in enumerate(problems):
        log(f"probing {i+1}/{len(problems)}: {p['id']}")
        r = probe_one(p, ctx)
        results.append(r)

    # Aggregate
    passed1 = sum(1 for r in results if r["pass_1"])
    passed10 = sum(1 for r in results if r["pass_10"])
    passed_any = sum(1 for r in results if r["pass_total"])
    pass_at_1 = passed1 / len(results) if results else 0
    pass_at_10 = passed10 / len(results) if results else 0
    pass_at_max = passed_any / len(results) if results else 0
    gate_open = pass_at_10 >= args.target_pass_at_10

    receipt = {
        "schema_version": 4,
        "probe_runner": "minif2f-probe-runner.py",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "n": args.n,
            "max_iters_per_problem": args.max_iters,
            "target_pass_at_10": args.target_pass_at_10,
            "no_sidecar": args.no_sidecar,
            "dry_run": args.dry_run,
            "problem_set_source": source,
            "main_url": args.main_url,
            "sidecar_url": args.sidecar_url,
            "main_model": args.main_model,
            "sidecar_model": args.sidecar_model,
            "prompt_format": "chat_completions_v2",
        },
        "health": {"main": ctx.get("main_health"), "sidecar": ctx.get("sidecar_health")},
        "results": results,
        "aggregate": {
            "problems_attempted": len(results),
            "pass_at_1": pass_at_1,
            "pass_at_10": pass_at_10,
            "pass_at_max_iters": pass_at_max,
            "target_pass_at_10": args.target_pass_at_10,
            "gate_open": gate_open,
        },
        "amber_resolution": "GREEN" if gate_open else "RED",
        "citations": {
            "memo": "research/2026-04-26_lean4-on-qwen72b-awq-validation.md",
            "memo_section": "7.7 Validation gate — flip AMBER to GREEN/RED",
        },
        "notes": [
            "v2: Fixed prompt format for instruction-tuned models (chat completions).",
            "Goedel-Prover-V2-8B uses Lean file context with sorry replacement.",
            "Qwen-14B-Instruct uses instruction-following format.",
            "Blackwell RTX PRO 6000 — Qwen-72B-AWQ incompatible (FlashInfer/gptqmodel fail on sm_120).",
        ],
    }

    # Write receipt
    receipt_dir = Path(args.receipt_dir)
    receipt_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    receipt_path = receipt_dir / f"{ts}.json"
    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")

    # Also write to local path for paper-22-23
    local_receipt_dir = Path("/root") / "research" / "paper-22-23-sidecar-probe"
    local_receipt_dir.mkdir(parents=True, exist_ok=True)
    local_receipt_path = local_receipt_dir / f"{ts}.json"
    local_receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")

    print(json.dumps(receipt["aggregate"], indent=2))
    log(f"receipt written: {receipt_path}")
    log(f"local receipt: {local_receipt_path}")
    log(f"AMBER -> {receipt['amber_resolution']}")

    sys.exit(0 if gate_open else 1)

if __name__ == "__main__":
    main()