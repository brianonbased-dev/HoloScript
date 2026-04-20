# Marketplace publication readiness

**Purpose:** Single checklist for **VS Code Marketplace / Open VSX** and **npm** so distribution is repeatable before campaigns. Aligns with board task *Distribution — marketplace publication readiness*.

**Owner:** Engineering prepares artifacts; marketing owns copy, screenshots, and launch sequencing.

---

## 1. VS Code extension (`packages/vscode-extension`)

| Item | Verify |
|------|--------|
| `publisher`, `name`, `displayName`, `version` | `package.json` — current publisher `holoscript`, package id `holoscript-vscode` |
| `repository` + `bugs` URLs | Point at canonical GitHub; `directory` field set for monorepo |
| `icon` | Present (`icons/holoscript-logo.png`) |
| `engines.vscode` | Matches minimum VS Code you test against |
| `license` | SPDX in package and in repo root |
| README (extension root) | Features, MCP section, install steps, keyboard shortcuts |
| CHANGELOG | User-visible changes per release |
| Permissions / `contributes` | Each capability justified in README (MCP, preview, LSP, debug) |
| Build | `pnpm` / compile produces `out/extension.js` as `main` |
| Packaging | `vsce package` (or org equivalent) succeeds; `.vsix` smoke-install on clean profile |
| Open VSX (optional) | Duplicate publish if policy requires non-Microsoft registry |

**Pre-flight commands (from extension package):**

```bash
pnpm install
pnpm run compile
pnpm exec vsce package
```

---

## 2. npm (`@holoscript/*` and `create-holoscript*`)

| Item | Verify |
|------|--------|
| `name`, `version`, `description` | Every publishable `package.json` |
| `repository.directory` | Monorepo subpath for deep links |
| `files` / `.npmignore | package `files` | Tarball excludes fat dev artifacts |
| `keywords` | HoloScript, XR, MCP, etc. |
| `publishConfig.access` | `public` for scoped packages |
| Provenance / CI | Prefer trusted publishing from CI where enabled |
| Install smoke | `npm pack` dry run; `pnpm add` in blank project for key packages |
| Docs cross-links | `docs/NUMBERS.md` verification commands for npm surface |

---

## 3. Go-to-market coordination

| Item | Owner |
|------|--------|
| Screenshots / GIFs for marketplace listing | Marketing + Studio capture |
| Short demo script (60s) | Marketing |
| Review prompts / early adopters | Marketing |
| Badges (version, license) in GitHub README | Engineering |

---

## 4. Exit criteria (readiness = true when…)

1. VSIX installs on a **clean** VS Code profile and MCP + preview paths work per README.
2. Primary npm entrypoints (`create-holoscript`, core scoped packages you promote) **install without peer warnings** in the documented Node range.
3. Checklist above is **ticked in release issue** with links to CI run and version tags.

---

## References

- Extension: `packages/vscode-extension/README.md`, `CHANGELOG_MCP_INTEGRATION.md`
- Integration Hub: `packages/studio/INTEGRATION_HUB.md`
- Live numbers: `docs/NUMBERS.md`
