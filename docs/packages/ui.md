# @holoscript/ui

`@holoscript/ui` is the shared React component package for HoloScript Studio,
dashboards, and agent-facing interfaces. It packages Tailwind-based controls and
status primitives so product surfaces can share visual and interaction behavior
without copying component code across packages.

## Install

```bash
npm install @holoscript/ui
```

Consumers must provide React, React DOM, and Tailwind configuration compatible
with the package peer dependencies.

## Use

```tsx
import { Badge, Button, Input, Spinner, StatCard } from '@holoscript/ui';

export function StatusPanel() {
  return (
    <section>
      <Badge variant="default">Live</Badge>
      <StatCard title="Runs" value={128} format="number" />
      <Input placeholder="Search scenes" />
      <Button variant="outline">Save</Button>
      <Spinner size="sm" />
    </section>
  );
}
```

## Package Surface

| Surface                    | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `Button`, `Badge`, `Input` | Basic command, status, and form primitives   |
| `Spinner`, `StatCard`      | Loading and metric display components        |
| `PanelSplitter`            | Resize handle for split-pane product layouts |
| `ContextMenu`              | Fixed-position contextual command menu       |
| `SimplePropertyInspector`  | Object property editing surface              |
| `ErrorBoundary`            | Recoverable React crash boundary             |
| `Modal`, `TabGroup`        | Shared studio workflow containers            |
| `UncertaintyIndicator`     | Confidence/provenance display primitive      |
| `multimodal`               | Accessibility helper exports                 |
| `cn`                       | Tailwind class merge helper                  |

## Strategy Role

This package is a supported UI primitive layer, not the HoloScript authoring
surface itself. Use it when Studio, dashboards, previews, or agent interfaces
need shared React controls. Keep HoloScript scenes, render surfaces, and
compiler-owned output in `.holo`, `.hsplus`, generated assets, or renderer
packages rather than hand-growing application screens inside `@holoscript/ui`.

## Validation

```bash
corepack pnpm --filter @holoscript/ui run build
corepack pnpm --filter @holoscript/ui run test
corepack pnpm --filter @holoscript/ui run typecheck
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
