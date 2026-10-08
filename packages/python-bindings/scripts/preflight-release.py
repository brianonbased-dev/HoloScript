#!/usr/bin/env python3
"""Does the built artifact tell the truth? Run it before any upload.

6.0.8 is an honesty release, so the only question that matters about the artifact is
whether its claims hold when installed. Its predecessor passed its own test suite while
`parse()` returned success for `SELECT * FROM users; DROP TABLE users;` — the tests
asserted that success. So this runs against an INSTALLED WHEEL in a clean venv with no
extras, which is what a user gets, not against the source tree with dev deps present.

Usage (the publish scripts do this for you):
    python -m venv /tmp/pf && /tmp/pf/bin/pip install dist/holoscript-*.whl
    /tmp/pf/bin/python scripts/preflight-release.py [--expect 6.0.8]

Exit 0 means every claim held. Exit 1 lists what failed; do not publish.

Every check below corresponds to a claim the release makes. When you add a capability,
add the check that proves it here — a claim in capabilities() with nothing verifying it
is how 6.0.7 happened.
"""
from __future__ import annotations

import argparse
import inspect
import json
import os
import sys
import tempfile

FAILS: list[str] = []


def check(name, fn, want=None):
    try:
        got = fn()
    except Exception as exc:  # a check that crashes is a failed check
        FAILS.append(f"{name}: raised {type(exc).__name__}: {exc}")
        print(f"FAIL  {name}  (raised {type(exc).__name__}: {exc})")
        return
    ok = (got is True) if want is None else (got == want)
    print(f"{'PASS ' if ok else 'FAIL '} {name}" + ("" if ok else f"  (got {got!r}, want {want!r})"))
    if not ok:
        FAILS.append(f"{name}: got {got!r}, want {want!r}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect", default=None, help="version the artifact must report")
    opts = ap.parse_args()

    import holoscript as hs

    print(f"pre-flight for holoscript {hs.__version__} (installed at {os.path.dirname(hs.__file__)})\n")
    if opts.expect:
        check("the installed artifact is the version being published", lambda: hs.__version__, opts.expect)

    # --- the defect this release exists to fix ------------------------------------
    faults = [
        "", "{{{@@@", "object Cube { position: [0, 1, 0]", "}",
        "SELECT * FROM users; DROP TABLE users;", "this is not holo at all",
        '{ "a": 1 }', "@", "cube { @color(red) @grabbable }", 42, None,
    ]

    def refuses(fn):
        def go():
            accepted = []
            for src in faults:
                try:
                    fn(src)
                    accepted.append(repr(src))
                except NotImplementedError:
                    pass
                except Exception as exc:
                    accepted.append(f"{src!r} -> {type(exc).__name__}")
            return accepted or True
        return go

    check("parse() refuses every input, including the SQL 6.0.7 accepted", refuses(hs.parse))
    check("validate() refuses every input", refuses(hs.validate))

    def refusal_is_actionable():
        try:
            hs.parse("x")
        except NotImplementedError as exc:
            return "6.1.0" in str(exc) and "@holoscript/core" in str(exc)
        return "parse did not raise"

    check("the refusal names the version and the runtime that can parse", refusal_is_actionable)

    # --- machine-readable self-description ----------------------------------------
    caps = hs.capabilities()
    check("capabilities() agrees with __version__", lambda: caps["version"], hs.__version__)
    check("capabilities() declares parse unimplemented", lambda: caps["not_implemented"]["parse"], "6.1.0")
    check("capabilities() declares validate unimplemented", lambda: caps["not_implemented"]["validate"], "6.1.0")
    check("capabilities() claims no grammar while there is none", lambda: caps["grammar"] is None)
    check("capabilities() survives JSON, so an agent can branch on it", lambda: bool(json.dumps(caps)))
    check(
        "capabilities() never lists a name as both implemented and not",
        lambda: sorted(
            (set(caps["implemented"]) | set(caps["implemented"]["bridges"]) | set(caps["implemented"]["cognition"]))
            & set(caps["not_implemented"])
        ),
        [],
    )
    check(
        "capabilities() states the list_traits registry mismatch",
        lambda: "@grabbable" in caps["implemented"]["list_traits"] and "registry" in caps["implemented"]["list_traits"],
    )
    check(
        "list_traits() docstring carries the same caveat as capabilities()",
        lambda: "registry" in (hs.list_traits.__doc__ or "") and "@grabbable" in (hs.list_traits.__doc__ or ""),
    )

    # --- bridges on a clean install, which is where 6.0.7 died --------------------
    def medical_guard():
        try:
            import holoscript.bridges.medical  # noqa: F401
        except ImportError as exc:
            return "pip install" in str(exc) and "medical" in str(exc)
        except SystemExit:
            return "STILL EXITS THE INTERPRETER AT IMPORT — the 6.0.7 defect"
        return "imported with no pydicom present; the dependency guard is gone"

    check("bridges.medical raises ImportError naming the extra, never sys.exit", medical_guard)

    def imports(mod):
        def go():
            try:
                __import__(mod)
                return True
            except Exception as exc:
                return f"{type(exc).__name__}: {exc}"
        return go

    for mod in ("alphafold", "robotics", "narupa", "scientific", "radio_astronomy"):
        check(f"bridges.{mod} imports with no extras installed", imports(f"holoscript.bridges.{mod}"))

    # --- every surface capabilities() calls implemented must actually work --------
    claimed = (caps.get("implemented") or {}).get("cognition") or []
    if claimed:
        import holoscript.cognition as cog

        missing = [name for name in claimed if not hasattr(cog, name)]
        check("every cognition name capabilities() claims exists", lambda: missing or True)
        for name in claimed:
            fn = getattr(cog, name, None)
            if callable(fn):
                try:
                    print(f"      {name}{inspect.signature(fn)}")
                except (TypeError, ValueError):
                    pass

        def round_trip():
            log = os.path.join(tempfile.mkdtemp(), "decisions.ndjson")
            cog.record_decision(log, "preflight-1", "publish", status="open")
            cog.record_decision(log, "preflight-2", "yank the old one", causes=["preflight-1"])
            rows = cog.read_log(log)
            if len(rows) != 2:
                return f"wrote 2 decisions, read back {len(rows)}"
            if rows[0].get("id") != "preflight-1":
                return f"first row is {rows[0].get('id')!r}"
            if rows[1].get("causes") != ["preflight-1"]:
                return f"causal edge lost: {rows[1].get('causes')!r}"
            return True

        check("cognition round-trips a decision log with its causal edge", round_trip)

    print()
    if FAILS:
        print(f"{len(FAILS)} check(s) failed — DO NOT PUBLISH:")
        for item in FAILS:
            print(f"  - {item}")
        return 1
    print("All pre-flight checks passed. The artifact's claims hold when installed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
