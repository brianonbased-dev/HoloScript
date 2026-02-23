"""
HoloScript Renderer - Generate previews of HoloScript scenes.
"""

from typing import Optional, Tuple
from dataclasses import dataclass
import base64
import requests
import urllib.parse


@dataclass
class RenderResult:
    """Result of rendering HoloScript code."""
    success: bool
    url: Optional[str] = None
    preview_url: Optional[str] = None
    embed_code: Optional[str] = None
    base64_data: Optional[str] = None
    error: Optional[str] = None


# Service URLs
RENDER_SERVICE_URL = "https://api.holoscript.net"
PLAYGROUND_URL = "https://play.holoscript.net"


def render(
    code: str,
    format: str = "png",
    resolution: Tuple[int, int] = (800, 600),
    camera_position: Tuple[float, float, float] = (0, 2, 5),
    duration: int = 3000,
    quality: str = "preview",
    api_url: Optional[str] = None,
    api_key: Optional[str] = None
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
        api_url: Custom API URL
        api_key: API key for authenticated requests
    
    Returns:
        RenderResult with URL or base64 data
    """
    # Validate code first
    errors = quick_validate(code)
    if errors:
        return RenderResult(
            success=False,
            error=f"Invalid HoloScript code: {', '.join(errors)}"
        )
    
    # Try remote rendering if API is available
    if api_url:
        try:
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            
            response = requests.post(
                f"{api_url}/render",
                json={
                    "code": code,
                    "format": format,
                    "resolution": list(resolution),
                    "camera": {"position": list(camera_position)},
                    "duration": duration,
                    "quality": quality,
                },
                headers=headers,
                timeout=30
            )
            
            if response.ok:
                result = response.json()
                return RenderResult(
                    success=True,
                    url=result.get("url"),
                    preview_url=result.get("previewUrl"),
                    embed_code=generate_embed_code(result.get("previewUrl"), resolution)
                )
        except requests.RequestException:
            # Fall through to local rendering
            pass
    
    # Local/mock rendering - return playground link
    encoded_code = urllib.parse.quote(base64.b64encode(code.encode()).decode())
    preview_url = f"{PLAYGROUND_URL}?code={encoded_code}"
    
    return RenderResult(
        success=True,
        url=None,  # No static image locally
        preview_url=preview_url,
        embed_code=generate_embed_code(preview_url, resolution)
    )


def quick_validate(code: str) -> list:
    """Quick validation check."""
    errors = []
    
    if not code.strip():
        errors.append("Empty code")
    
    open_braces = code.count("{")
    close_braces = code.count("}")
    if open_braces != close_braces:
        errors.append("Unbalanced braces")
    
    return errors


def generate_embed_code(url: str, resolution: Tuple[int, int]) -> str:
    """Generate HTML embed code."""
    width, height = resolution
    return f'''<iframe 
  src="{url}" 
  width="{width}" 
  height="{height}" 
  frameborder="0" 
  allowfullscreen 
  allow="xr-spatial-tracking"
></iframe>'''
