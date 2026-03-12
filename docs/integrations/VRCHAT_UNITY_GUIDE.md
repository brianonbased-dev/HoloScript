# VRChat & Unity Export Guide

Practical workflow for exporting HoloScript scenes to Unity projects and VRChat worlds.

## Overview

Current export flow is compiler-target based.

| Tool | Role |
| --- | --- |
| @holoscript/cli | Primary compile/export interface |
| @holoscript/compiler | Programmatic compiler entrypoint |
| @holoscript/core | Parsing and AST utilities |

## Recommended Workflow

1. Author scene logic in .holo or .hsplus.
2. Validate with the CLI.
3. Compile to unity or vrchat target.
4. Import output into your Unity project (and VRChat SDK project when targeting VRChat).

```bash
# Install CLI
npm install -g @holoscript/cli

# Validate source
holoscript validate scene.hsplus

# Compile for Unity project
holoscript compile scene.hsplus --target unity --output ./UnityProject/Assets/HoloScript

# Compile for VRChat project
holoscript compile scene.hsplus --target vrchat --output ./VRChatProject/Assets/HoloScript
```

## Programmatic Pipeline

Programmatic compiler APIs vary by release. Use the CLI commands above as the stable interface for CI/CD and reproducible exports.

## Target Notes

### Unity

- Recommended: Unity LTS (2021.3+ or 2022.3+).
- XR: use XR Plugin Management and XR Interaction Toolkit when building VR interactions.

### VRChat

- Use Unity version required by current VRChat Creator Companion.
- Ensure World SDK and UdonSharp are installed in the target project.

## Best Practices

- Keep source target-agnostic where possible.
- Validate before compile to catch trait or syntax issues early.
- Use a web target for fast preview, then compile to Unity/VRChat for final integration.

```bash
# Fast preview loop
holoscript dev scene.hsplus
```

## Troubleshooting

| Issue | Resolution |
| --- | --- |
| Missing VRChat scripts/components | Confirm VCC project has World SDK + UdonSharp |
| Unity import errors | Verify target Unity version and package dependencies |
| Compile failures | Run holoscript validate first and fix parser/trait diagnostics |

## See Also

- /compilers/unity
- /compilers/vrchat
- /compilers/vrchat-optimization
- /guides/troubleshooting
