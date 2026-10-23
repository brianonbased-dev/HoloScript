"""Smoke tests for the 6.0.8 contract.

The 6.0.7 version of this file asserted that `parse` returned success for
`cube { @color(red) ... }` — which it did, as it did for any non-empty string,
including text that is not HoloScript. Those assertions are why the stub
survived a release.
"""

import pytest

from holoscript import __version__, capabilities, list_traits, parse, validate


def test_parse_is_not_implemented() -> None:
    with pytest.raises(NotImplementedError) as exc:
        parse("cube { @color(red) @position(0, 1, 0) @grabbable }")
    assert "6.1.0" in str(exc.value), "the error should say where parsing lands"


def test_validate_is_not_implemented() -> None:
    with pytest.raises(NotImplementedError):
        validate("cube { @grabbable }")


def test_list_traits_returns_values() -> None:
    traits = list_traits()
    assert len(traits) > 0
    assert "@grabbable" in traits


def test_capabilities_match_the_version() -> None:
    caps = capabilities()
    assert caps["version"] == __version__
    assert caps["not_implemented"]["parse"] == "6.1.0"
    assert "bridges" in caps["implemented"]
