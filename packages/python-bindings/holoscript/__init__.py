"""Python bindings for HoloScript.

6.0.8 is an honesty release. The HoloScript parser is not implemented in the
Python package, and this version stops pretending it is: ``parse`` and
``validate`` raise instead of returning success for any input. Real parsing
is planned for 6.1.0, built on the strict rejection layer for the grammar
``@holoscript/core`` uses, so the two runtimes cannot drift.

What works today: the domain bridges under ``holoscript.bridges`` (except
``alphafold``, which is a stub) and the decision surfaces under
``holoscript.cognition``. Ask the package what it implements, and the limits of
each part, with ``holoscript.capabilities()``.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List

# Release version injected by CI from git tag. Dev version for local use.
__version__ = "6.0.8"

#: Where parsing actually lives until 6.1.0 ships.
_NO_PARSER = (
    "HoloScript parsing is not implemented in the Python package "
    "(holoscript {version}). It is planned for 6.1.0, on the same grammar "
    "as @holoscript/core. Until then, parse with the npm package "
    "@holoscript/core, or call the hosted compiler -- and check what comes back: "
    "core is permissive and can return an empty composition for text that is "
    "not HoloScript. "
    "See holoscript.capabilities() for what this version does implement."
).format(version=__version__)


@dataclass
class ParseResult:
    """Shape reserved for 6.1.0. Nothing in 6.0.8 returns one."""

    success: bool
    ast: Dict[str, Any]
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    format: str = "holo"


@dataclass
class ValidationResult:
    """Shape reserved for 6.1.0. Nothing in 6.0.8 returns one."""

    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def parse(code: str) -> ParseResult:
    """Not implemented in this release.

    Raises:
        NotImplementedError: always. Through 6.0.7 this returned
            ``ParseResult(success=True)`` for any non-empty string, including
            text that is not HoloScript at all.
    """
    raise NotImplementedError(_NO_PARSER)


def validate(code: str) -> ValidationResult:
    """Not implemented in this release.

    Raises:
        NotImplementedError: always. See :func:`parse`.
    """
    raise NotImplementedError(_NO_PARSER)


def list_traits() -> List[str]:
    """Return a static snapshot of five trait names.

    This is a hard-coded list, not a reading of the trait registry, and it does
    not agree with the core: of these five, only ``@grabbable`` appears in the
    core's trait registry (``@physics``, ``@clickable``, ``@color`` and
    ``@position`` do not; the nearest ids are ``rigidbody`` and ``gpu_physics``).
    The registry's size is not quoted here on purpose -- it changes with every
    deploy, and docs/NUMBERS.md gives the command that reads it.
    Resolve which list is the truth before 6.1.0, which reads the registry.
    """
    return ["@grabbable", "@physics", "@clickable", "@color", "@position"]


def capabilities() -> Dict[str, Any]:
    """Machine-readable truth about this build.

    Agents and CI should branch on this rather than on the README. Every
    entry under ``implemented`` is checked by scripts/preflight-release.py against
    the installed wheel before any upload -- at least that it imports or exists;
    record_decision and read_log are also exercised end to end. Gaps that check
    cannot see are stated under ``limits``.

    ``not_implemented`` names top-level functions, plus ``bridges.alphafold``: that
    module ships and imports, but no path in it returns a structure (the AlphaFold
    API endpoint is a placeholder that does not resolve, and the local ColabFold
    path is not written), so it is not listed under ``implemented``. A value is the
    release a name is planned for; ``None`` means unscheduled. ``scene_render`` is
    rendering a HoloScript scene, which nothing here does;
    ``holoscript.cognition.render`` (an SVG of a decision log) is implemented and
    listed under ``cognition``.
    """
    return {
        "version": __version__,
        "grammar": None,  # set to the core grammar version once 6.1.0 ships
        "implemented": {
            "list_traits": "static snapshot of 5 names; only @grabbable is in the core's trait registry",
            "bridges": [
                "medical",
                "narupa",
                "radio_astronomy",
                "robotics",
                "scientific",
            ],
            "cognition": ["record_decision", "read_log", "render"],
        },
        "limits": {
            "medical": "dicom_to_mesh is not implemented; extract_3d_volume returns "
            "dimensions and value range only, not voxels",
            "narupa": "needs nanover-server, which no extra installs",
            "radio_astronomy": "calculate_synchrotron is a placeholder formula",
            "scientific": "needs AutoDock Vina: pip install vina; the [scientific] extra "
            "does not install it",
            "cognition.render": "shells out to the npm holo-decision program; raises "
            "RuntimeError when it is not installed",
        },
        "not_implemented": {
            "parse": "6.1.0",
            "validate": "6.1.0",
            "generate": None,
            "scene_render": None,
            "share": None,
            "bridges.alphafold": None,
        },
    }


__all__ = [
    "__version__",
    "ParseResult",
    "ValidationResult",
    "parse",
    "validate",
    "list_traits",
    "capabilities",
]
