"""The gates 6.0.7 did not have.

These tests fail against 6.0.7 and pass against 6.0.8. Wire them into CI before
the release, not after: the first one is the whole point of the release.
"""

import os
import subprocess
import sys

import pytest

import holoscript

GARBAGE = [
    "{{{@@@",
    "}}}}}}}}",
    "SELECT * FROM users; DROP TABLE users;",
    "this is not holo at all",
    "",
    "\n\n\t",
]

#: Every bridge module the package ships, implemented or not. Keep in step with
#: SHIPPED_BRIDGES in scripts/preflight-release.py.
BRIDGES = [
    "alphafold",
    "medical",
    "narupa",
    "radio_astronomy",
    "robotics",
    "scientific",
]

#: The directory that holds the holoscript package these tests imported, so a
#: subprocess started elsewhere imports the same copy.
PACKAGE_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(holoscript.__file__)))


def _run_python(code, cwd=None):
    env = dict(os.environ)
    env["PYTHONPATH"] = PACKAGE_PARENT + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=cwd, env=env)


@pytest.mark.parametrize("source", GARBAGE)
def test_parse_never_reports_success_for_garbage(source):
    """6.0.7 returned ParseResult(success=True) for every one of these."""
    with pytest.raises(NotImplementedError):
        holoscript.parse(source)


@pytest.mark.parametrize("source", GARBAGE)
def test_validate_never_reports_valid_for_garbage(source):
    with pytest.raises(NotImplementedError):
        holoscript.validate(source)


def test_valid_source_also_raises_until_the_parser_lands():
    """No special case: 6.0.8 has no parser, so it says so for valid input too."""
    with pytest.raises(NotImplementedError):
        holoscript.parse("object Cube { position: [0, 1, 0] }")


def test_capabilities_tells_the_truth():
    caps = holoscript.capabilities()
    assert caps["version"] == holoscript.__version__
    assert set(caps["not_implemented"]) >= {"parse", "validate"}
    assert caps["not_implemented"]["parse"] == "6.1.0"
    assert caps["grammar"] is None, "set this to the core grammar version when 6.1.0 ships"


def test_nothing_is_both_implemented_and_not():
    """6.0.8's first draft listed render under cognition AND not_implemented."""
    caps = holoscript.capabilities()
    impl = caps["implemented"]
    implemented = set(impl) | set(impl["bridges"]) | set(impl["cognition"])
    implemented |= {f"bridges.{b}" for b in impl["bridges"]} | {f"cognition.{c}" for c in impl["cognition"]}
    not_implemented = set(caps["not_implemented"])
    not_implemented |= {n.split(".", 1)[1] for n in not_implemented if "." in n}
    both = implemented & not_implemented
    assert not both, f"claimed both implemented and not: {sorted(both)}"


def test_every_implemented_bridge_ships():
    caps = holoscript.capabilities()
    assert set(caps["implemented"]["bridges"]) <= set(BRIDGES)


def test_alphafold_is_not_called_implemented():
    """No path in the alphafold bridge returns a structure (claude4 review of #527, P1)."""
    caps = holoscript.capabilities()
    assert "alphafold" not in caps["implemented"]["bridges"]
    assert "bridges.alphafold" in caps["not_implemented"]
    assert "alphafold" not in caps["limits"], "limits are for implemented parts"


def test_alphafold_local_path_fails_even_with_colabfold_present():
    """If this starts passing a structure back, move alphafold to implemented."""
    from holoscript.bridges.alphafold import AlphaFoldBridge

    bridge = AlphaFoldBridge()
    bridge.colabfold_available = True
    got = bridge.predict_structure({"sequence": "MKTAYIAKQRQ", "mode": "local"})
    assert got["status"] == "failed", got


def test_alphafold_api_path_fails_closed_without_a_key():
    from holoscript.bridges.alphafold import AlphaFoldBridge

    bridge = AlphaFoldBridge()
    bridge.api_key = None
    assert bridge.predict_structure({"sequence": "MKTAYIAKQRQ"})["status"] == "failed"


def test_limits_name_the_gaps_preflight_cannot_see():
    limits = holoscript.capabilities()["limits"]
    assert "pip install vina" in limits["scientific"]
    assert "nanover-server" in limits["narupa"]
    assert "dicom_to_mesh" in limits["medical"] and "extract_3d_volume" in limits["medical"]


@pytest.mark.parametrize(
    "dep, call, status, install_line",
    [
        (
            "roslibpy",
            "from holoscript.bridges.robotics import ROS2Bridge as B; r = B().connect()",
            "failed",
            "pip install 'holoscript[robotics]'",
        ),
        (
            "vina",
            "from holoscript.bridges.scientific import AutoDockBridge as B; r = B().run_docking("
            "{'protein_pdb': 'r.pdb', 'ligand_mol': 'l.mol', 'box_center': [0, 0, 0], 'box_size': [1, 1, 1]})",
            "failed",
            "pip install vina",
        ),
        (
            "nanover",
            "from holoscript.bridges.narupa import NarupaBridge as B; r = B().start_server({'pdb_path': 'x.pdb'})",
            "error",
            "nanover-server",
        ),
    ],
)
def test_bridge_reports_a_missing_dependency_in_its_result(dep, call, status, install_line):
    """What the README says: these import, then report the gap instead of raising.

    The dependency is blocked in the child (a None entry in sys.modules makes its
    import raise), so this runs the missing-dependency path whether or not the
    package happens to be installed on this machine.
    """
    code = f"import json, sys\nsys.modules[{dep!r}] = None\n{call}\nprint(json.dumps(r))\n"
    proc = _run_python(code)
    assert proc.returncode == 0, proc.stderr[-400:]
    assert f'"status": "{status}"' in proc.stdout, proc.stdout
    assert install_line in proc.stdout, proc.stdout


def test_importing_narupa_creates_no_file_and_leaves_logging_alone(tmp_path):
    """narupa used to run logging.basicConfig with a FileHandler at import (review P3)."""
    proc = _run_python(
        "import logging\n"
        "import holoscript.bridges.narupa\n"
        "print(len(logging.getLogger().handlers))\n",
        cwd=str(tmp_path),
    )
    assert proc.returncode == 0, proc.stderr[-400:]
    assert proc.stdout.strip() == "0", "importing narupa configured the root logger"
    assert list(tmp_path.iterdir()) == [], f"importing narupa created {list(tmp_path.iterdir())}"


def test_medical_rpc_extract3DVolume_reaches_the_method(tmp_path):
    """The JSON-RPC entry called a misspelled method, so it always errored (review P2)."""
    missing = str(tmp_path / "no-such-series")
    code = (
        "import io, json, sys, types\n"
        "sys.modules['pydicom'] = types.ModuleType('pydicom')\n"
        "sys.modules['numpy'] = types.ModuleType('numpy')\n"
        "from holoscript.bridges import medical\n"
        f"sys.stdin = io.StringIO(json.dumps({{'method': 'extract3DVolume', 'params': {{'seriesPath': {missing!r}}}}}) + '\\n')\n"
        "medical.main()\n"
    )
    proc = _run_python(code)
    assert proc.returncode == 0, proc.stderr[-400:]
    assert "Not a directory" in proc.stdout, proc.stdout


def test_exports_match_what_is_implemented():
    """Nothing is exported that the package cannot do."""
    for name in ("generate", "render", "share", "HoloScript"):
        assert not hasattr(holoscript, name), f"{name} is exported but not implemented"


@pytest.mark.parametrize("module", BRIDGES)
def test_importing_a_bridge_never_kills_the_process(module):
    """6.0.7's medical bridge called sys.exit(1) at import time."""
    code = (
        "try:\n"
        f"    import holoscript.bridges.{module}\n"
        "except ImportError as exc:\n"
        "    assert 'pip install' in str(exc), 'ImportError must name the install line'\n"
    )
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert proc.returncode == 0, (
        f"importing holoscript.bridges.{module} exited with {proc.returncode}: "
        f"{proc.stderr.strip()[:400]}"
    )
