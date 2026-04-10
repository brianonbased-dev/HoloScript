# @holoscript/visual

Node-based visual programming interface for HoloScript.

## Features

- **20+ Node Types**: Event, Action, Logic, and Data nodes
- **Drag-and-Drop**: Intuitive node placement and wiring
- **Live Code Preview**: See generated HoloScript code in real-time
- **Multiple Formats**: Export to `.hs`, `.hsplus`, or `.holo`
- **Undo/Redo**: Full history support with keyboard shortcuts
- **Trait Inference**: Automatically adds required traits based on nodes used

## Installation

```bash
pnpm add @holoscript/visual
```

## Quick Start

```tsx
import { VisualEditor } from '@holoscript/visual';

function App() {
  return (
    <VisualEditor
      objectName="myButton"
      onChange={(graph) => console.log('Graph changed:', graph)}
    />
  );
}
```

## Node Types

### Event Nodes (Green)

- **On Click** - Triggered when object is clicked
- **On Hover** - Triggered on hover enter/exit
- **On Grab** - Triggered when grabbed in VR
- **On Tick** - Triggered every frame
- **On Timer** - Triggered after a delay
- **On Collision** - Triggered on physics collision
- **On Trigger** - Triggered on trigger zone enter/exit

### Action Nodes (Blue)

- **Play Sound** - Play an audio file
- **Play Animation** - Play an animation
- **Set Property** - Set a property on an object
- **Toggle** - Toggle a boolean property
- **Spawn** - Create a new object
- **Destroy** - Remove an object

### Logic Nodes (Yellow)

- **If/Else** - Conditional branching
- **Switch** - Multi-way branching
- **And/Or/Not** - Logical operators
- **Compare** - Value comparison
- **Math** - Arithmetic operations

### Data Nodes (Purple)

- **Constant** - A constant value
- **This** - Reference to current object
- **Get Property** - Get a property value
- **Random** - Generate random numbers
- **Interpolate** - Linear interpolation
- **Vector3** - Create 3D vectors

## Code Generation

The visual graph converts to valid HoloScript:

```
┌──────────┐     ┌─────────────┐     ┌────────────┐
│ On Click │────▶│ Play Sound  │────▶│ Set Color  │
│          │     │ "click.mp3" │     │ "#ff0000"  │
└──────────┘     └─────────────┘     └────────────┘
```

Generates:

```hsplus
composition myButton {
  @clickable

  on_click: {
    audio.play("click.mp3")
    this.color = "#ff0000"
  }
}
```

## API Reference

### VisualEditor Props

| Prop               | Type              | Default      | Description               |
| ------------------ | ----------------- | ------------ | ------------------------- | ------------- |
| `initialGraph`     | `VisualGraph`     | `undefined`  | Graph to load initially   |
| `objectName`       | `string`          | `"myObject"` | Name for generated code   |
| `onChange`         | `(graph) => void` | `undefined`  | Called when graph changes |
| `sidebarWidth`     | `number`          | `260`        | Sidebar width in pixels   |
| `codePreviewWidth` | `number`          | `300`        | Code preview width        |
| `showToolbar`      | `boolean`         | `true`       | Show the toolbar          |
| `showCodePreview`  | `boolean`         | `true`       | Show code preview panel   |
| `height`           | `string           | number`      | `"100vh"`                 | Editor height |

### Keyboard Shortcuts

| Shortcut                  | Action                   |
| ------------------------- | ------------------------ |
| `Ctrl+Z`                  | Undo                     |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo                     |
| `Delete` / `Backspace`    | Delete selected nodes    |
| `Ctrl+D`                  | Duplicate selected nodes |

### Programmatic Access

```tsx
import { useGraphStore, graphToCode } from '@holoscript/visual';

// Access the store directly
const nodes = useGraphStore.getState().nodes;
const addNode = useGraphStore.getState().addNode;

// Generate code from a graph
const result = graphToCode(graph, {
  format: 'hsplus',
  objectName: 'myObject',
});
console.log(result.code);
```

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run tests
pnpm test

# Build
pnpm build
```

## License

Apache-2.0
