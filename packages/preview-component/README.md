# @holoscript/preview-component

Standalone React component for embedding interactive HoloScript 3D scene previews in GitHub PRs, docs, and playgrounds.

## Usage

```bash
pnpm install
```

```tsx
import { HoloPreview } from '@holoscript/preview-component';
import '@holoscript/preview-component/styles.css';
```

Requires `react` and `react-dom` (v18+). `three` is an optional peer dependency.

## Development

```bash
pnpm dev            # Build with watch mode (tsup)
pnpm test           # Run tests (vitest)
pnpm test:coverage  # Run tests with coverage
pnpm typecheck      # Type-check without emitting
```
