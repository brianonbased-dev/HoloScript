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

## Package boundary & release posture

**Audience.** `@holoscript/preview-component` is built for external doc authors, package maintainers, and playground operators who want to embed an interactive HoloScript 3D scene preview in a GitHub PR, static docs site, or public playground — it is a consumer-facing embed, not an internal tool.

**Bring your own composition.** The component renders whatever HoloScript composition, screenshot fallback, or Three.js scene the caller supplies as props; it does not assume a specific backend, CDN, or asset host, and any network calls it makes are pointed at endpoints you configure via caller-owned props or environment variables.

**Package boundary.** This package does not ship credentials, founder-local file paths, or a private workspace default — the only inputs are the composition data and optional styling passed in by the embedding page.

**Release posture: v0-preview** (current version 0.1.0). The API surface may still change between minor versions; known limitations include no built-in offline/error-boundary fallback yet. Treat upgrades as a preview and be ready to rollback if a new version changes prop shapes. Run `pnpm typecheck` and `pnpm test` to validate a new version against your embed before upgrading in production.
