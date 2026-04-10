#!/usr/bin/env python3
"""Fix framework/package.json to add skills and negotiation exports."""
import json
from pathlib import Path

pkg_path = Path("packages/framework/package.json")
with open(pkg_path, 'r') as f:
    pkg = json.load(f)

# Add new exports
pkg["exports"]["./skills"] = {
    "import": "./dist/skills/index.js",
    "types": "./dist/skills/index.d.ts"
}
pkg["exports"]["./negotiation"] = {
    "import": "./dist/negotiation/index.js",
    "types": "./dist/negotiation/index.d.ts"
}

# Write back with 2-space indent
with open(pkg_path, 'w') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')

print("✅ Added skills and negotiation exports to framework/package.json")
