"""
HoloScript Python Bindings

Parse, validate, generate, and render HoloScript code from Python.
Perfect for AI agents like Grok to build VR experiences.
"""

from holoscript.client import HoloScript
from holoscript.parser import parse, parse_holo, parse_hsplus
from holoscript.validator import validate, ValidationResult, ValidationError
from holoscript.generator import generate, generate_object, generate_scene
from holoscript.renderer import render, RenderResult
from holoscript.sharer import share, ShareResult
from holoscript.traits import list_traits, explain_trait, suggest_traits
from holoscript.robotics import (
    export_urdf,
    export_sdf,
    generate_ros2_launch,
    list_robotics_traits,
    URDFExportResult,
    SDFExportResult,
    ROSLaunchResult,
)

__version__ = "5.3.0"
__all__ = [
    # Main client
    "HoloScript",

    # Parsing
    "parse",
    "parse_holo",
    "parse_hsplus",

    # Validation
    "validate",
    "ValidationResult",
    "ValidationError",

    # Generation
    "generate",
    "generate_object",
    "generate_scene",

    # Rendering
    "render",
    "RenderResult",

    # Sharing
    "share",
    "ShareResult",

    # Traits
    "list_traits",
    "explain_trait",
    "suggest_traits",

    # Robotics (URDF, SDF, ROS 2)
    "export_urdf",
    "export_sdf",
    "generate_ros2_launch",
    "list_robotics_traits",
    "URDFExportResult",
    "SDFExportResult",
    "ROSLaunchResult",
]
