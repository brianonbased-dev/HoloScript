"""The gates 6.0.7 did not have.

These tests fail against 6.0.7 and pass against 6.0.8. Wire them into CI before
the release, not after: the first one is the whole point of the release.
"""

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

BRIDGES = [
    "alphafold",
    "medical",
    "narupa",
    "radio_astronomy",
    "robotics",
    "scientific",
]


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
    implemented = set(caps["implemented"]) | set(caps["implemented"]["bridges"]) | set(
        caps["implemented"]["cognition"]
    )
    both = implemented & set(caps["not_implemented"])
    assert not both, f"claimed both implemented and not: {sorted(both)}"


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
