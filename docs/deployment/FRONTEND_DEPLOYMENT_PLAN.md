# HoloScript Frontend Deployment Plan

## Current Status

The generated VitePress/GitHub Pages docs site is retired. Markdown under
`docs/` remains source documentation, but it is not a separately deployed
frontend. Keep documentation validation in the root repo checks and deploy
public web surfaces through their owning services.

| Surface | Owner | Deployment Path |
| --- | --- | --- |
| HoloScript landing page | `services/holoscript-net` | Railway Docker build |
| Studio | `packages/studio` | Railway service / package-owned deployment |
| Marketplace web/API | `packages/marketplace-*` | Railway service / package-owned deployment |
| Markdown docs | `docs/` | Repository source, not a generated site |
| TypeDoc API output | `pnpm docs:api` | Generated into `docs/api/` when refreshed |

## Documentation Validation

Run these from the repository root when docs change:

```bash
pnpm docs:counts:drift
pnpm docs:roadmap:drift
pnpm docs:api
```

Use `git diff --check -- <changed-doc-paths>` before committing docs edits.
Do not add a docs-site dependency tree or generated static output under
`docs/`; the retired VitePress surface should stay absent.

## HoloScript Net

`services/holoscript-net` builds the native landing client and Express server.
It copies `docs/public/live-evidence.json` into `dist/client/` when present.

```bash
pnpm --filter @holoscript/net-service build
pnpm --filter @holoscript/net-service test
```

The service returns `410` for `/docs/*` because the generated docs site no
longer ships. Keep public documentation links pointed at repository Markdown or
at first-class product pages.

## Railway Checklist

- Run the package-owned build for the service you changed.
- Verify the service health endpoint after deploy.
- Keep environment variables in Railway/project secrets, not in docs.
- Update `SURFACES.md` when a public URL or ownership boundary changes.
