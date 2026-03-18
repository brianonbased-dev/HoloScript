"""
Grok REST API Pipeline Demo

Chains a natural-language prompt through the HoloScript REST API:
  1. Generate scene code (via Python SDK)
  2. Validate the code
  3. POST /api/render  -> get preview URL
  4. POST /api/share   -> get X share link, tweet text, QR code

Usage:
    # Use the live hosted server (default):
    python examples/ai-generation/grok-rest-pipeline.py

    # Or use a local server:
    cd packages/mcp-server && PORT=3000 node dist/http-server.js
    python examples/ai-generation/grok-rest-pipeline.py --base-url http://localhost:3000

    # Or use the SDK only (no server required):
    python examples/ai-generation/grok-rest-pipeline.py --sdk-only
"""

import sys
import json

# --- SDK pipeline (no server needed) ---

def sdk_pipeline():
    """Full pipeline using the holoscript Python package (pip install holoscript)."""
    from holoscript import generate, validate, share, suggest_traits, list_traits

    print("=== HoloScript SDK Pipeline ===\n")

    # 1. Generate
    prompt = "a glowing crystal floating above a dark cave floor"
    print(f"1. Generating scene: '{prompt}'")
    scene = generate(prompt)
    print(f"   Code length: {len(scene.code)} chars")
    print(f"   Preview:\n   {scene.code[:120]}...\n")

    # 2. Validate
    print("2. Validating...")
    result = validate(scene.code)
    print(f"   Valid: {result.valid}")
    if not result.valid:
        for err in result.errors:
            print(f"   Error: {err.message}")
        return

    # 3. Suggest social traits
    print("3. Suggesting traits for 'share this on X and collaborate'...")
    traits = suggest_traits("share this on X and collaborate")
    print(f"   Suggested: {traits['traits']}")

    # 4. List social category
    print("4. Listing social trait category...")
    social = list_traits("social")
    print(f"   Social traits: {social['social']}")

    # 5. Share on X
    print("5. Creating X share link...")
    link = share(scene.code, title="Cave Crystal", platform="x")
    print(f"   Playground: {link.playground_url}")
    print(f"   Tweet text: {link.tweet_text[:80]}...")
    print(f"   QR code: {link.qr_code[:60]}...")
    print(f"   Card meta: {link.card_meta}")

    print("\n=== Pipeline complete ===")


# --- REST API pipeline (requires running server) ---

def rest_pipeline(base_url="https://mcp.holoscript.net"):
    """Full pipeline using the REST API endpoints."""
    import requests

    print(f"=== HoloScript REST API Pipeline ({base_url}) ===\n")

    # 0. Health check
    print("0. Health check...")
    try:
        resp = requests.get(f"{base_url}/api/health", timeout=5)
        health = resp.json()
        print(f"   Status: {health['status']}")
        print(f"   Capabilities: {health['capabilities']}")
    except requests.ConnectionError:
        print(f"   ERROR: Cannot connect to {base_url}")
        print("   Live server: https://mcp.holoscript.net")
        print("   Local server: cd packages/mcp-server && PORT=3000 node dist/http-server.js")
        return

    # 1. Generate scene code via SDK
    from holoscript import generate, validate

    prompt = "a shareable art gallery with collaborative sculptures"
    print(f"\n1. Generating scene: '{prompt}'")
    scene = generate(prompt)
    code = scene.code
    print(f"   Generated {len(code)} chars")

    # 2. Validate locally
    print("\n2. Validating...")
    v = validate(code)
    print(f"   Valid: {v.valid}")

    # 3. POST /api/render
    print("\n3. POST /api/render...")
    resp = requests.post(f"{base_url}/api/render", json={
        "code": code,
        "format": "png",
        "resolution": [1200, 630],
        "quality": "preview",
    }, timeout=10)
    render = resp.json()
    print(f"   Success: {render.get('success')}")
    print(f"   Preview URL: {render.get('previewUrl', 'N/A')}")
    print(f"   Embed code: {render.get('embedCode', 'N/A')[:60]}...")

    # 4. POST /api/share
    print("\n4. POST /api/share...")
    resp = requests.post(f"{base_url}/api/share", json={
        "code": code,
        "title": "Collaborative Art Gallery",
        "description": "Interactive 3D gallery with social VR traits",
        "platform": "x",
    }, timeout=10)
    share_result = resp.json()
    print(f"   Playground: {share_result.get('playgroundUrl', 'N/A')}")
    print(f"   Tweet: {share_result.get('tweetText', 'N/A')[:80]}...")
    print(f"   QR: {share_result.get('qrCode', 'N/A')[:60]}...")
    print(f"   Card: {json.dumps(share_result.get('cardMeta', {}), indent=2)[:120]}...")

    print("\n=== REST Pipeline complete ===")


if __name__ == "__main__":
    # Parse --base-url argument
    base_url = "https://mcp.holoscript.net"
    for i, arg in enumerate(sys.argv):
        if arg == "--base-url" and i + 1 < len(sys.argv):
            base_url = sys.argv[i + 1]

    if "--sdk-only" in sys.argv:
        sdk_pipeline()
    elif "--rest-only" in sys.argv:
        rest_pipeline(base_url)
    else:
        sdk_pipeline()
        print("\n" + "=" * 60 + "\n")
        rest_pipeline(base_url)
