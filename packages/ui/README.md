# @holoscript/ui

> Shared React UI components for the HoloScript ecosystem. Dark-themed, Tailwind CSS-based primitives used across Studio, dashboards, and agent interfaces.

## Installation

```bash
pnpm add @holoscript/ui
```

Peer dependencies: `react ^19.2.0`, `react-dom ^19.2.4`.

Requires Tailwind CSS configured in the consuming app. Components use `tailwind-merge` + `clsx` for class composition.

## Usage

```tsx
import { Button, Badge, Input, Spinner, StatCard } from '@holoscript/ui';

function Dashboard() {
  return (
    <div>
      <Badge variant="default">Live</Badge>
      <StatCard title="Revenue" value={12500} format="usd" trend={4.2} />
      <Input placeholder="Search..." />
      <Button variant="outline" size="sm">Save</Button>
      <Spinner size="md" />
    </div>
  );
}
```

## Components

| Component | Description |
|-----------|-------------|
| `Button` | Forwarded-ref button with 6 variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) and 4 sizes (`default`, `sm`, `lg`, `icon`). |
| `Badge` | Inline status pill with 4 variants (`default`, `secondary`, `outline`, `destructive`). Rounded-full, small text. |
| `Input` | Forwarded-ref text input. Dark-themed with emerald focus ring. Accepts all native input props. |
| `Spinner` | Animated SVG loading indicator. 3 sizes (`sm`, `md`, `lg`). |
| `StatCard` | Metric display card with trend indicator. Formats: `usd`, `eth`, `number`. Shows up/down arrows via `lucide-react`. Supports `loading` skeleton state. |
| `PanelSplitter` | Draggable resize handle for split-panel layouts. Supports mouse and touch. Emits pixel deltas; parent controls clamping. Horizontal or vertical. |
| `ContextMenu` | Fixed-position right-click menu with Edit, Duplicate, Delete actions. Auto-clamps to viewport. Closes on outside click. |
| `SimplePropertyInspector` | Sidebar panel for editing object name, color (preset grid + custom picker), and size (range slider). Studio-themed. |
| `ErrorBoundary` | Class-based error boundary with labeled crash messages, retry/reload buttons, `onError` callback, optional `renderFallback`, and dev-only stack traces. |

## Utilities

| Export | Description |
|--------|-------------|
| `cn(...classes)` | Merges Tailwind classes without conflicts. Wraps `clsx` + `tailwind-merge`. |

## Theming

All components use a dark color palette built on Tailwind's `slate` scale with `emerald` accents:

- **Backgrounds**: `slate-900`, `slate-800`
- **Text**: `slate-100`, `slate-300`, `slate-400`
- **Accent**: `emerald-500` (focus rings, primary buttons, links)
- **Destructive**: `red-500` / `red-400`
- **Studio tokens**: Some components reference `studio-*` custom colors (`studio-panel`, `studio-border`, `studio-accent`, `studio-muted`, `studio-text`). These must be defined in the consuming app's Tailwind config.

Override styles by passing `className` -- `cn()` ensures your classes win over defaults.

## Adding New Components

1. Create `src/components/YourComponent.tsx`.
2. Use `cn()` for all class merging. Follow the dark slate + emerald accent palette.
3. Export from `src/index.ts`.
4. Add tests in `src/__tests__/YourComponent.test.tsx` using `@testing-library/react`.
5. Run `pnpm test` and `pnpm typecheck` before committing.

## Build

```bash
pnpm build        # tsup -> dist/ (CJS + ESM + .d.ts)
pnpm dev          # watch mode
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
```
