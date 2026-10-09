#!/usr/bin/env python3
"""Does the built artifact tell the truth? Run it before any upload.

6.0.8 is an honesty release, so the only question that matters about the artifact is
whether its claims hold when installed. Its predecessor passed its own test suite while
`parse()` returned success for `SELECT * FROM users; DROP TABLE users;` — the tests
asserted that success. So this runs against an INSTALLED WHEEL in a clean venv with no
extras, which is what a user gets, not against the source tree with dev deps present.

Usage (the publish scripts do this for you):
    python -m venv /tmp/pf && /tmp/pf/bin/pip install dist/holoscript-*.whl
    /tmp/pf/bin/python -I scripts/preflight-release.py [--expect 6.0.8]

-I (isolated mode) keeps PYTHONPATH, the user site and the script's own folder off
sys.path. Without it, an exported PYTHONPATH can put the source tree ahead of the
installed wheel. The script refuses to grade anything but an installed copy either way.

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
import site
import sys
import sysconfig
import tempfile

FAILS: list[str] = []
_ABSENT = object()

#: Every bridge module the wheel ships. capabilities() may only call a bridge
#: implemented if it is one of these.
SHIPPED_BRIDGES = ("alphafold", "medical", "narupa", "radio_astronomy", "robotics", "scientific")


def _norm(path: str) -> str:
    return os.path.normcase(os.path.realpath(path))


def _is_under(path: str, root: str) -> bool:
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:  # different drives on Windows
        return False


def install_location_problem(module_file: str) -> str | None:
    """Why ``module_file`` is not an installed copy in this interpreter, or None.

    Pre-flight exists to catch what only the built wheel gets wrong (6.0.7 died on a
    clean install, not in the source tree). Grading the source tree and calling it the
    artifact is the failure this refuses: the module must live in a site-packages
    directory of sys.prefix, and not inside the package this script came from.
    """
    here = _norm(module_file)
    own_package = _norm(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))
    if _is_under(here, own_package):
        return f"it was imported from the source tree this script belongs to ({here})"
    prefix = _norm(sys.prefix)
    candidates = set(site.getsitepackages([sys.prefix]))
    for key in ("purelib", "platlib"):
        candidates.add(sysconfig.get_path(key))
    site_dirs = sorted({_norm(p) for p in candidates if p} - {prefix})
    site_dirs = [d for d in site_dirs if _is_under(d, prefix)]
    if not any(_is_under(here, d) for d in site_dirs):
        return (
            f"it was imported from {here}, which is not in a site-packages directory of "
            f"this interpreter's prefix ({prefix}; looked in: {', '.join(site_dirs) or 'none'})"
        )
    return None


def check(name, fn, want=None):
    try:
        got = fn()
    except Exception as exc:  # a check that crashes is a failed check
        FAILS.append(f"{name}: raised {type(exc).__name__}: {exc}")
        print(f"FAIL  {name}  (raised {type(exc).__name__}: {exc})")
        return
    ok = (got is True) if want is None else (got == want)
    shown = True if want is None else want  # a check with no `want` must return True
    print(f"{'PASS ' if ok else 'FAIL '} {name}" + ("" if ok else f"  (got {got!r}, want {shown!r})"))
    if not ok:
        FAILS.append(f"{name}: got {got!r}, want {shown!r}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect", default=None, help="version the artifact must report")
    opts = ap.parse_args()

    import holoscript as hs

    problem = install_location_problem(hs.__file__)
    if problem:
        print(
            "REFUSED: pre-flight grades the installed wheel, and the holoscript it imported "
            f"is not one: {problem}.\n"
            "Install the wheel into a clean venv and run this with that venv's interpreter "
            "in isolated mode, from outside the source tree:\n"
            "    <venv python> -I scripts/preflight-release.py --expect <version>\n"
            "Nothing was checked. Do not publish on this run."
        )
        return 1

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
    def implemented_names():
        impl = caps["implemented"]
        names = set(impl) | set(impl["bridges"]) | set(impl["cognition"])
        names |= {f"bridges.{b}" for b in impl["bridges"]} | {f"cognition.{c}" for c in impl["cognition"]}
        return names

    def not_implemented_names():
        names = set(caps["not_implemented"])
        return names | {n.split(".", 1)[1] for n in names if "." in n}

    check(
        "capabilities() never lists a name as both implemented and not",
        lambda: sorted(implemented_names() & not_implemented_names()),
        [],
    )
    check(
        "every bridge capabilities() calls implemented is a module the wheel ships",
        lambda: sorted(set(caps["implemented"]["bridges"]) - set(SHIPPED_BRIDGES)),
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

    for mod in SHIPPED_BRIDGES:
        if mod != "medical":
            check(f"bridges.{mod} imports with no extras installed", imports(f"holoscript.bridges.{mod}"))

    # --- alphafold is a stub, so it must not be called implemented ----------------
    # Through the first 6.0.8 draft, capabilities() listed alphafold as implemented and
    # said the local path only needed a ColabFold install. It never returns a structure.
    # Force the local path with ColabFold "present": if it ever starts working, this
    # check fails and tells you to move alphafold back to implemented.
    def alphafold_local_fails_with_colabfold_present():
        from holoscript.bridges.alphafold import AlphaFoldBridge

        bridge = AlphaFoldBridge()
        bridge.colabfold_available = True  # pretend ColabFold is installed
        got = bridge.predict_structure({"sequence": "MKTAYIAKQRQ", "mode": "local"})
        if got.get("status") != "failed":
            return (
                f"the local ColabFold path returned status {got.get('status')!r}; if it really "
                "works now, move alphafold to implemented and rewrite this check"
            )
        return True

    check("bridges.alphafold: the local path fails even with ColabFold present", alphafold_local_fails_with_colabfold_present)

    def alphafold_api_fails_closed_without_key():
        from holoscript.bridges.alphafold import AlphaFoldBridge

        bridge = AlphaFoldBridge()
        bridge.api_key = None  # never reach the network from pre-flight
        return bridge.predict_structure({"sequence": "MKTAYIAKQRQ"}).get("status") == "failed"

    check("bridges.alphafold: the API path fails closed without a key", alphafold_api_fails_closed_without_key)

    def alphafold_not_claimed():
        if "alphafold" in caps["implemented"]["bridges"]:
            return "capabilities() lists alphafold under implemented.bridges, but no path in it returns a structure"
        if "bridges.alphafold" not in caps["not_implemented"]:
            return "capabilities() does not list bridges.alphafold under not_implemented"
        return True

    check("capabilities() lists alphafold as not implemented, not as implemented", alphafold_not_claimed)

    # --- what a bridge does when its dependency is missing (README and guide claim) --
    # medical raises ImportError at import (checked above); these import fine and report
    # the missing dependency in the result they return, naming the install line.
    # scientific and narupa need a package no extra installs, which limits must say.
    def reports_missing(dep, call, status, install_line, limit_word=None):
        def go():
            # Block the import (a None entry in sys.modules makes it raise) so the
            # missing-dependency path is what runs, even if the package is present.
            saved = sys.modules.get(dep, _ABSENT)
            sys.modules[dep] = None
            try:
                got = call()
            finally:
                if saved is _ABSENT:
                    del sys.modules[dep]
                else:
                    sys.modules[dep] = saved
            if got.get("status") != status:
                return f"returned status {got.get('status')!r}, want {status!r}: {got!r}"
            if install_line not in json.dumps(got):
                return f"result does not name {install_line!r}: {got!r}"
            if limit_word is not None and limit_word not in caps["limits"].get(call.__name__, ""):
                return f"capabilities()['limits'][{call.__name__!r}] does not mention {limit_word!r}"
            return True
        return go

    def robotics():
        from holoscript.bridges.robotics import ROS2Bridge

        return ROS2Bridge().connect()

    def scientific():
        from holoscript.bridges.scientific import AutoDockBridge

        return AutoDockBridge().run_docking(
            {"protein_pdb": "r.pdb", "ligand_mol": "l.mol", "box_center": [0, 0, 0], "box_size": [1, 1, 1]}
        )

    def narupa():
        from holoscript.bridges.narupa import NarupaBridge

        return NarupaBridge().start_server({"pdb_path": "missing.pdb"})

    def alphafold():
        from holoscript.bridges.alphafold import AlphaFoldBridge

        # A key makes it reach for requests, which a clean install does not have; the
        # lazy import raises before any network call.
        return AlphaFoldBridge(api_key="preflight-not-a-key").predict_structure({"sequence": "MKTAYIAKQRQ"})

    check(
        "bridges.robotics without roslibpy: status failed, names the install line",
        reports_missing("roslibpy", robotics, "failed", "pip install 'holoscript[robotics]'"),
    )
    check(
        "bridges.alphafold without requests: status failed, names the install line",
        reports_missing("requests", alphafold, "failed", "pip install 'holoscript[alphafold]'"),
    )
    check(
        "bridges.scientific without vina: status failed, names pip install vina, limits say so",
        reports_missing("vina", scientific, "failed", "pip install vina", "vina"),
    )
    check(
        "bridges.narupa without nanover: status error, names nanover-server, limits say so",
        reports_missing("nanover", narupa, "error", "nanover-server", "nanover-server"),
    )
    check(
        "capabilities() states the medical bridge's gaps",
        lambda: all(w in caps["limits"].get("medical", "") for w in ("dicom_to_mesh", "extract_3d_volume")),
    )

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
