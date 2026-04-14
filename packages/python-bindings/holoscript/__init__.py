from dataclasses import dataclass, field
from typing import Dict, List

# Release version injected by CI from git tag. Dev version for local use.
__version__ = "6.0.5"


@dataclass
class ParseResult:
    success: bool
    ast: Dict[str, str]
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    format: str = "holo"


@dataclass
class ValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def parse(code: str) -> ParseResult:
    stripped = code.strip()
    if not stripped:
        return ParseResult(success=False, ast={}, errors=["Input is empty"])

    return ParseResult(
        success=True,
        ast={"type": "composition", "source": stripped},
    )


def validate(code: str) -> ValidationResult:
    if not code.strip():
        return ValidationResult(valid=False, errors=["Input is empty"])

    return ValidationResult(valid=True)


def list_traits() -> List[str]:
    return ["@grabbable", "@physics", "@clickable", "@color", "@position"]


__all__ = [
    "__version__",
    "ParseResult",
    "ValidationResult",
    "parse",
    "validate",
    "list_traits",
]
