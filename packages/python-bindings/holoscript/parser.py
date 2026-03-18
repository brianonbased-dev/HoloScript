"""
HoloScript Parser - Python implementation for parsing HoloScript code.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import re


@dataclass
class ParseError:
    """A parsing error with location information."""
    message: str
    line: int
    column: int = 0
    severity: str = "error"


@dataclass
class ParseResult:
    """Result of parsing HoloScript code."""
    success: bool
    ast: Optional[Dict[str, Any]] = None
    errors: List[ParseError] = field(default_factory=list)
    warnings: List[ParseError] = field(default_factory=list)
    format: str = "unknown"
    objects: List[str] = field(default_factory=list)
    traits: List[str] = field(default_factory=list)


def parse(code: str, format: str = "auto") -> ParseResult:
    """
    Parse HoloScript code into an AST.
    
    Args:
        code: Source code to parse
        format: Format hint - "hs", "hsplus", "holo", or "auto"
    
    Returns:
        ParseResult with AST and errors
    """
    # Auto-detect format
    if format == "auto":
        if "composition" in code:
            format = "holo"
        elif "@" in code:
            format = "hsplus"
        else:
            format = "hs"
    
    if format == "holo":
        return parse_holo(code)
    else:
        return parse_hsplus(code)


def parse_holo(code: str) -> ParseResult:
    """
    Parse .holo composition code.
    
    Args:
        code: .holo source code
    
    Returns:
        ParseResult with composition AST
    """
    errors: List[ParseError] = []
    warnings: List[ParseError] = []
    
    # Extract basic structure
    lines = code.split("\n")
    
    # Find composition name
    composition_match = re.search(r'composition\s+"([^"]+)"', code)
    composition_name = composition_match.group(1) if composition_match else "Unnamed"
    
    # Find objects
    object_pattern = r'object\s+"([^"]+)"'
    objects = re.findall(object_pattern, code)
    
    # Find traits
    trait_pattern = r'@(\w+)'
    traits = list(set(re.findall(trait_pattern, code)))
    
    # Basic validation
    open_braces = code.count("{")
    close_braces = code.count("}")
    if open_braces != close_braces:
        errors.append(ParseError(
            message=f"Unbalanced braces: {open_braces} open, {close_braces} close",
            line=1,
            severity="error"
        ))
    
    # Build AST
    ast = {
        "type": "Composition",
        "name": composition_name,
        "environment": extract_environment(code),
        "templates": extract_templates(code),
        "objects": [{"name": obj} for obj in objects],
        "logic": extract_logic(code),
    }
    
    return ParseResult(
        success=len(errors) == 0,
        ast=ast,
        errors=errors,
        warnings=warnings,
        format="holo",
        objects=objects,
        traits=traits,
    )


def parse_hsplus(code: str) -> ParseResult:
    """
    Parse .hs or .hsplus code.
    
    Args:
        code: .hs/.hsplus source code
    
    Returns:
        ParseResult with AST
    """
    errors: List[ParseError] = []
    warnings: List[ParseError] = []
    
    # Find objects (orb, cube, sphere, etc.)
    object_pattern = r'(orb|cube|sphere|cylinder|model)\s+(\w+)'
    object_matches = re.findall(object_pattern, code)
    objects = [match[1] for match in object_matches]
    
    # Find traits
    trait_pattern = r'@(\w+)'
    traits = list(set(re.findall(trait_pattern, code)))
    
    # Basic validation
    open_braces = code.count("{")
    close_braces = code.count("}")
    if open_braces != close_braces:
        errors.append(ParseError(
            message=f"Unbalanced braces: {open_braces} open, {close_braces} close",
            line=1,
            severity="error"
        ))
    
    # Check for unknown traits
    known_traits = {
        "grabbable", "throwable", "holdable", "clickable", "hoverable",
        "draggable", "pointable", "scalable", "collidable", "physics",
        "rigid", "kinematic", "trigger", "gravity", "glowing", "emissive",
        "transparent", "reflective", "animated", "billboard", "networked",
        "synced", "persistent", "owned", "host_only", "stackable",
        "attachable", "equippable", "consumable", "destructible", "anchor",
        "tracked", "world_locked", "hand_tracked", "eye_tracked",
        "spatial_audio", "ambient", "voice_activated", "state", "reactive",
        "observable", "computed",
        # Social
        "shareable", "collaborative", "tweetable",
    }
    
    for trait in traits:
        if trait.lower() not in known_traits:
            # Find line number
            for i, line in enumerate(code.split("\n"), 1):
                if f"@{trait}" in line:
                    warnings.append(ParseError(
                        message=f"Unknown trait: @{trait}",
                        line=i,
                        severity="warning"
                    ))
                    break
    
    # Build AST
    ast = {
        "type": "Program",
        "objects": [
            {
                "type": match[0],
                "name": match[1],
            }
            for match in object_matches
        ],
        "traits": traits,
    }
    
    return ParseResult(
        success=len(errors) == 0,
        ast=ast,
        errors=errors,
        warnings=warnings,
        format="hsplus" if "@" in code else "hs",
        objects=objects,
        traits=traits,
    )


def extract_environment(code: str) -> Dict[str, Any]:
    """Extract environment block from .holo code."""
    env_match = re.search(r'environment\s*{([^}]*)}', code, re.DOTALL)
    if not env_match:
        return {}
    
    env_content = env_match.group(1)
    environment = {}
    
    # Extract skybox
    skybox_match = re.search(r'skybox:\s*"([^"]+)"', env_content)
    if skybox_match:
        environment["skybox"] = skybox_match.group(1)
    
    # Extract ambient_light
    light_match = re.search(r'ambient_light:\s*([\d.]+)', env_content)
    if light_match:
        environment["ambient_light"] = float(light_match.group(1))
    
    return environment


def extract_templates(code: str) -> List[Dict[str, Any]]:
    """Extract template blocks from .holo code."""
    templates = []
    template_pattern = r'template\s+"([^"]+)"\s*{([^}]*)}'
    
    for match in re.finditer(template_pattern, code, re.DOTALL):
        templates.append({
            "name": match.group(1),
            "content": match.group(2).strip(),
        })
    
    return templates


def extract_logic(code: str) -> Dict[str, Any]:
    """Extract logic block from .holo code."""
    logic_match = re.search(r'logic\s*{([^}]*)}', code, re.DOTALL)
    if not logic_match:
        return {}
    
    return {
        "content": logic_match.group(1).strip(),
    }
