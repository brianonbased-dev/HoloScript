"""Optional-dependency handling for the bridges.

A library never ends the host process. Every bridge imports its optional
dependencies through :func:`require`, which raises ``ImportError`` carrying the
exact install line, so a notebook, a server or an agent run survives the
mistake and the user is told how to fix it.
"""

from importlib import import_module
from typing import Any, Dict, Sequence


def require(modules: Sequence[str], extra: str) -> Dict[str, Any]:
    """Import optional dependencies or raise a useful ImportError.

    Args:
        modules: importable module names, e.g. ``("pydicom", "numpy")``.
        extra: the extra that provides them, e.g. ``"medical"``.

    Returns:
        A mapping of module name to the imported module.

    Raises:
        ImportError: naming the missing modules and the install command.
    """
    loaded: Dict[str, Any] = {}
    missing = []
    for name in modules:
        try:
            loaded[name] = import_module(name)
        except ImportError:
            missing.append(name)
    if missing:
        raise ImportError(
            "holoscript.bridges.{extra} needs {missing}. "
            "Install it with: pip install 'holoscript[{extra}]'".format(
                extra=extra, missing=", ".join(missing)
            )
        )
    return loaded
