"""HoloScript decision-network client — feed the shared cognition stream from Python.

Codex (and any Python agent) appends decisions to the SAME JSONL event log the npm
``holo-decision`` CLI renders, so both families draw into ONE live, native, receipt-bound
surface. The founder sees the thought network build itself instead of babysitting telemetry.

Event schema (one JSON object per line) matches ``@holoscript/core`` ``DecisionEvent``::

    {"id": "gate", "label": "Geometry gate", "receipt": "commit 20f4a047",
     "status": "shipped", "causes": ["bug"], "agent": "codex"}

Typical use::

    from holoscript.cognition import decision_network as dn
    dn.record_decision(LOG, "gate", "Geometry gate",
                       receipt="commit 20f4a047", status="shipped",
                       causes=["bug"], agent="codex")
    dn.render(LOG, "cognition.png", title="live decision stream")  # needs the npm bin
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Optional, Sequence

__all__ = ["record_decision", "read_log", "render"]


def record_decision(
    log_path: str,
    id: str,
    label: str,
    *,
    receipt: Optional[str] = None,
    status: Optional[str] = None,
    causes: Optional[Sequence[str]] = None,
    agent: Optional[str] = None,
    seq: Optional[int] = None,
) -> dict:
    """Append one decision to the shared cognition stream (creates the log if needed)."""
    if not id or not label:
        raise ValueError("record_decision requires id and label")
    event: dict = {"id": id, "label": label}
    if receipt:
        event["receipt"] = receipt
    if status:
        event["status"] = status
    if causes:
        event["causes"] = list(causes)
    if agent:
        event["agent"] = agent
    if seq is not None:
        event["seq"] = seq
    parent = os.path.dirname(os.path.abspath(log_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(event) + "\n")
    return event


def read_log(log_path: str) -> list[dict]:
    """Read the decision stream back (malformed lines are skipped, never fatal)."""
    if not os.path.exists(log_path):
        return []
    out: list[dict] = []
    with open(log_path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def render(
    log_path: str,
    out_path: str,
    *,
    title: Optional[str] = None,
    bin: str = "holo-decision",
) -> str:
    """Render the stream to SVG/PNG by shelling to the npm ``holo-decision`` renderer.

    Recording is pure-Python; rendering reuses the sovereign SVGCompiler via the node bin
    so there is ONE renderer of record. Raises if the bin is not installed (npm i -g
    @holoscript/core, or pass ``bin=`` with an explicit path).
    """
    exe = shutil.which(bin) or (bin if os.path.exists(bin) else None)
    if not exe:
        raise RuntimeError(
            f"{bin!r} not found on PATH — install @holoscript/core (npm) or pass bin=<path>"
        )
    # A raw .mjs/.js/.cjs script is not directly executable on Windows — run it via node.
    launcher = ["node", exe] if exe.lower().endswith((".mjs", ".js", ".cjs")) else [exe]
    args = [*launcher, "render", "--log", log_path, "--out", out_path]
    if title:
        args += ["--title", title]
    result = subprocess.run(args, check=True, capture_output=True, text=True)
    return result.stdout.strip()
