# @holoscript/domain-plugin-template

Starter package for turning domain knowledge into a reusable HoloScript plugin.

Use this when a human specialist or AI agent needs a new vertical package without
forking `@holoscript/core`. The template keeps domain contexts, package metadata,
and build outputs separate from the language kernel.

## Install

```bash
npm install @holoscript/domain-plugin-template
```

## Stewardship

Before publishing or expanding this package, run:

```bash
pnpm run build:package-release-closure
pnpm run check:npm-v1-release:built
```

