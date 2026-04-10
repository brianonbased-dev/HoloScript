# @holoscript/studio-bridge

> Bidirectional Visual-to-AST translation bridge between HoloScript Studio visual editor and the HoloScript AST/compiler pipeline.

## Overview

The studio-bridge provides bidirectional translation between the visual editor state (drag-and-drop objects, property panels, scene hierarchy) and the HoloScript AST. Changes in the visual editor produce valid AST updates, and changes to the AST are reflected in the visual editor in real-time.

## Architecture

```text
Visual Editor State ←──→ Studio Bridge ←──→ HoloScript AST
    (React/Zustand)     (bidirectional)    (CompositionParser)
```

## Key Components

| Component       | Purpose                                        |
| --------------- | ---------------------------------------------- |
| `VisualToAST`   | Converts visual editor state to HoloScript AST |
| `ASTToVisual`   | Converts HoloScript AST to visual editor state |
| `BridgeSync`    | Real-time bidirectional synchronization        |
| `ChangeTracker` | Tracks and merges concurrent edits             |

## Usage

```typescript
import { StudioBridge } from '@holoscript/studio-bridge';

const bridge = new StudioBridge(composition);

// Visual editor changes → AST
bridge.onVisualChange({ objectId: 'Cube', position: [1, 2, 3] });
const updatedAST = bridge.getAST();

// AST changes → Visual editor
bridge.onASTChange(newAST);
const visualState = bridge.getVisualState();
```

## Related

- [`@holoscript/studio`](../studio/) — Visual editor UI
- [`@holoscript/core`](../core/) — Parser and AST types
- [Parser Internals](../../docs/architecture/PARSER_INTERNALS.md)

## License

MIT
