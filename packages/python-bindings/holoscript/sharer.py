"""
HoloScript Sharer - Create shareable links for X and other platforms.
"""

from typing import Optional, Dict
from dataclasses import dataclass
import base64
import urllib.parse


@dataclass
class ShareResult:
    """Result of creating share links."""
    playground_url: str
    embed_url: str
    tweet_text: str
    qr_code: Optional[str] = None
    card_meta: Optional[Dict[str, str]] = None


# Service URLs
PLAYGROUND_URL = "https://play.holoscript.net"


def share(
    code: str,
    title: str = "HoloScript Scene",
    description: str = "Interactive 3D scene built with HoloScript",
    platform: str = "x"
) -> ShareResult:
    """
    Create shareable links for HoloScript code.
    
    Args:
        code: HoloScript source code
        title: Scene title
        description: Scene description
        platform: Target platform - "x", "generic", "codesandbox", "stackblitz"
    
    Returns:
        ShareResult with URLs and embed codes
    """
    # Encode code
    encoded_code = urllib.parse.quote(base64.b64encode(code.encode()).decode())
    
    # Generate URLs
    playground_url = generate_playground_url(code, title, platform)
    embed_url = generate_embed_url(code)
    
    # Generate tweet text
    tweet_text = generate_tweet_text(title, description, playground_url)
    
    # Generate QR code
    qr_code = generate_qr_code_url(playground_url)
    
    # Generate card meta
    card_meta = generate_card_meta(title, description, embed_url)
    
    return ShareResult(
        playground_url=playground_url,
        embed_url=embed_url,
        tweet_text=tweet_text,
        qr_code=qr_code,
        card_meta=card_meta
    )


def generate_playground_url(code: str, title: str, platform: str) -> str:
    """Generate a playground URL."""
    compressed = compress_code(code)
    
    if platform == "codesandbox":
        return generate_codesandbox_url(code, title)
    elif platform == "stackblitz":
        return generate_stackblitz_url(code, title)
    else:
        return f"{PLAYGROUND_URL}?code={compressed}&title={urllib.parse.quote(title)}"


def generate_embed_url(code: str) -> str:
    """Generate an embed URL."""
    compressed = compress_code(code)
    return f"{PLAYGROUND_URL}/embed?code={compressed}"


def compress_code(code: str) -> str:
    """Compress code for URL."""
    return urllib.parse.quote(base64.b64encode(code.encode()).decode())


def generate_codesandbox_url(code: str, title: str) -> str:
    """Generate a CodeSandbox URL."""
    # Simplified - would need proper API integration
    return f"https://codesandbox.io/s/holoscript-{title.lower().replace(' ', '-')}"


def generate_stackblitz_url(code: str, title: str) -> str:
    """Generate a StackBlitz URL."""
    return f"https://stackblitz.com/fork/holoscript-playground?title={urllib.parse.quote(title)}"


def generate_tweet_text(title: str, description: str, url: str) -> str:
    """Generate X-optimized tweet text."""
    max_desc_len = 200 - len(title) - len(url) - 20
    truncated_desc = (description[:max_desc_len - 3] + "...") if len(description) > max_desc_len else description
    
    return f"""🎮 {title}

{truncated_desc}

Try it in VR/AR: {url}

#HoloScript #VR #XR #Metaverse #3D"""


def generate_qr_code_url(url: str) -> str:
    """Generate a QR code URL."""
    return f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={urllib.parse.quote(url)}"


def generate_card_meta(title: str, description: str, embed_url: str) -> Dict[str, str]:
    """Generate Twitter Card meta tags."""
    return {
        "twitter:card": "player",
        "twitter:title": title,
        "twitter:description": description,
        "twitter:player": embed_url,
        "twitter:player:width": "800",
        "twitter:player:height": "600",
        "og:title": title,
        "og:description": description,
        "og:type": "website",
        "og:url": embed_url,
    }
