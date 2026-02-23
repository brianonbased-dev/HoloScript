"""
HoloScript Client - Main interface for HoloScript operations.
"""

from typing import Optional, Dict, Any, List
import requests

from holoscript.parser import parse, parse_holo, parse_hsplus, ParseResult
from holoscript.validator import validate, ValidationResult
from holoscript.generator import generate_object, generate_scene, GenerateResult
from holoscript.renderer import render, RenderResult
from holoscript.sharer import share, ShareResult
from holoscript.traits import list_traits, explain_trait, suggest_traits


class HoloScript:
    """
    Main HoloScript client for AI agents and Python applications.
    
    Example:
        >>> hs = HoloScript()
        >>> scene = hs.generate("a glowing crystal in a dark cave")
        >>> if hs.validate(scene.code).valid:
        ...     share = hs.share(scene.code, platform="x")
        ...     print(share.playground_url)
    """
    
    DEFAULT_API_URL = "https://api.holoscript.net"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        api_url: Optional[str] = None,
        local_mode: bool = False
    ):
        """
        Initialize HoloScript client.
        
        Args:
            api_key: Optional API key for remote rendering/services
            api_url: Custom API URL (defaults to https://api.holoscript.net)
            local_mode: If True, use local parsing only (no remote calls)
        """
        self.api_key = api_key
        self.api_url = api_url or self.DEFAULT_API_URL
        self.local_mode = local_mode
        
        self._session = requests.Session()
        if api_key:
            self._session.headers["Authorization"] = f"Bearer {api_key}"
    
    # === Parsing ===
    
    def parse(self, code: str, format: str = "auto") -> ParseResult:
        """
        Parse HoloScript code into an AST.
        
        Args:
            code: HoloScript source code
            format: Format hint - "hs", "hsplus", "holo", or "auto"
        
        Returns:
            ParseResult with AST and any errors
        """
        if format == "holo" or (format == "auto" and "composition" in code):
            return parse_holo(code)
        else:
            return parse_hsplus(code)
    
    # === Validation ===
    
    def validate(
        self,
        code: str,
        include_warnings: bool = True,
        include_suggestions: bool = True
    ) -> ValidationResult:
        """
        Validate HoloScript code for errors.
        
        Args:
            code: HoloScript source code or ParseResult
            include_warnings: Include warnings in result
            include_suggestions: Include fix suggestions
        
        Returns:
            ValidationResult with errors, warnings, and suggestions
        """
        return validate(
            code,
            include_warnings=include_warnings,
            include_suggestions=include_suggestions
        )
    
    # === Generation ===
    
    def generate(
        self,
        description: str,
        format: str = "holo",
        style: str = "detailed"
    ) -> GenerateResult:
        """
        Generate HoloScript code from natural language.
        
        Args:
            description: Natural language description of the scene
            format: Output format - "hs", "hsplus", or "holo"
            style: Style - "minimal", "detailed", or "production"
        
        Returns:
            GenerateResult with code and metadata
        """
        return generate_scene(description, format=format, style=style)
    
    def generate_object(
        self,
        description: str,
        format: str = "hsplus"
    ) -> GenerateResult:
        """
        Generate a single object from description.
        
        Args:
            description: Natural language description of the object
            format: Output format
        
        Returns:
            GenerateResult with object code
        """
        return generate_object(description, format=format)
    
    # === Rendering ===
    
    def render(
        self,
        code: str,
        format: str = "png",
        resolution: tuple = (800, 600),
        camera_position: tuple = (0, 2, 5),
        duration: int = 3000,
        quality: str = "preview"
    ) -> RenderResult:
        """
        Render HoloScript code to an image or video.
        
        Args:
            code: HoloScript source code
            format: Output format - "png", "gif", "mp4", "webp"
            resolution: (width, height) tuple
            camera_position: (x, y, z) camera position
            duration: Animation duration in ms (for gif/mp4)
            quality: "draft", "preview", or "production"
        
        Returns:
            RenderResult with URL or base64 data
        """
        return render(
            code,
            format=format,
            resolution=resolution,
            camera_position=camera_position,
            duration=duration,
            quality=quality,
            api_url=self.api_url if not self.local_mode else None,
            api_key=self.api_key
        )
    
    # === Sharing ===
    
    def share(
        self,
        code: str,
        title: str = "HoloScript Scene",
        description: str = "Interactive 3D scene built with HoloScript",
        platform: str = "x"
    ) -> ShareResult:
        """
        Create shareable links for the code.
        
        Args:
            code: HoloScript source code
            title: Scene title
            description: Scene description
            platform: Target platform - "x", "generic", "codesandbox", "stackblitz"
        
        Returns:
            ShareResult with URLs and embed codes
        """
        return share(
            code,
            title=title,
            description=description,
            platform=platform
        )
    
    # === Traits ===
    
    def list_traits(self, category: Optional[str] = None) -> Dict[str, List[str]]:
        """
        List available VR traits.
        
        Args:
            category: Filter by category (interaction, physics, visual, etc.)
        
        Returns:
            Dictionary of traits by category
        """
        return list_traits(category)
    
    def explain_trait(self, trait: str) -> Dict[str, Any]:
        """
        Get detailed documentation for a trait.
        
        Args:
            trait: Trait name (with or without @)
        
        Returns:
            Trait documentation dictionary
        """
        return explain_trait(trait)
    
    def suggest_traits(
        self,
        description: str,
        context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Suggest appropriate traits for an object.
        
        Args:
            description: Object description
            context: Additional context
        
        Returns:
            Suggested traits with reasoning
        """
        return suggest_traits(description, context)
    
    # === Utility ===
    
    def quick_test(self, code: str) -> Dict[str, Any]:
        """
        Quick test: parse, validate, and return summary.
        
        Args:
            code: HoloScript source code
        
        Returns:
            Dictionary with parse result, validation, and stats
        """
        parse_result = self.parse(code)
        validation = self.validate(code)
        
        return {
            "parsed": parse_result.success,
            "valid": validation.valid,
            "errors": validation.errors,
            "warnings": validation.warnings,
            "stats": {
                "lines": len(code.split("\n")),
                "characters": len(code),
                "objects": len(parse_result.objects) if hasattr(parse_result, "objects") else 0,
                "traits": len(parse_result.traits) if hasattr(parse_result, "traits") else 0,
            }
        }
