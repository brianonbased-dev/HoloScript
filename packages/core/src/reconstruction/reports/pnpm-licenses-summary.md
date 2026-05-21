# pnpm license snapshot — summary

**Tool:** `pnpm licenses list --json` (third-party dependency licenses; not the HoloScript `deploy/license-checker` composition helper).

**Workspace:** holoscript monorepo root

**Generated:** 2026-04-18

**Packages counted:** 2317

**Distinct license expressions:** 37

**Machine-readable listing:** [`pnpm-licenses-snapshot.json`](./pnpm-licenses-snapshot.json) (name, version, path, license, and metadata from pnpm).

## Counts by declared license

| License (SPDX / composite) | Packages |
| ---: | ---: |
| MIT | 1786 |
| Apache-2.0 | 256 |
| ISC | 89 |
| BSD-3-Clause | 43 |
| Apache-2.0 OR MIT | 35 |
| BSD-2-Clause | 26 |
| Unknown | 23 |
| MPL-2.0 | 10 |
| BlueOak-1.0.0 | 6 |
| SEE LICENSE IN LICENSE.md | 5 |
| Unlicense | 5 |
| (MIT OR Apache-2.0) | 3 |
| CC0-1.0 | 3 |
| MIT-0 | 2 |
| (Apache-2.0 AND MIT) | 2 |
| 0BSD | 2 |
| (Apache-2.0 AND BSD-3-Clause) | 1 |
| (CC-BY-4.0 AND MIT) | 1 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 |
| Remotion License https://remotion.dev/license | 1 |
| UNLICENSED | 1 |
| Remotion License (See https://remotion.dev/docs/webcodecs#license) | 1 |
| PolyForm-Shield-1.0.0 | 1 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| (Apache-2.0 OR MIT) | 1 |
| (MPL-2.0 OR Apache-2.0) | 1 |
| (MIT OR WTFPL) | 1 |
| (MIT AND Zlib) | 1 |
| Zlib | 1 |
| (BSD-2-Clause OR MIT OR Apache-2.0) | 1 |
| LGPL-3.0-only | 1 |
| (MIT AND BSD-3-Clause) | 1 |
| (WTFPL OR MIT) | 1 |
| (MIT OR CC0-1.0) | 1 |
| BSD | 1 |
| LGPL-3.0 | 1 |

## Review queue (spot-check / non-permissive / ambiguous)

Declared `license` fields can be wrong or composite. Counsel or OSPO should validate before major distribution changes.

| License | Packages |
| ---: | ---: |
| Unknown | 23 |
| BlueOak-1.0.0 | 6 |
| SEE LICENSE IN LICENSE.md | 5 |
| Unlicense | 5 |
| (CC-BY-4.0 AND MIT) | 1 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 |
| Remotion License https://remotion.dev/license | 1 |
| UNLICENSED | 1 |
| Remotion License (See https://remotion.dev/docs/webcodecs#license) | 1 |
| PolyForm-Shield-1.0.0 | 1 |
| CC-BY-4.0 | 1 |
| (MIT OR WTFPL) | 1 |
| LGPL-3.0-only | 1 |
| (WTFPL OR MIT) | 1 |
| LGPL-3.0 | 1 |

## How to refresh

```powershell
Set-Location <repo-root>
pnpm licenses list --json | Out-File -Encoding utf8NoBOM packages/core/src/reconstruction/reports/pnpm-licenses-snapshot.json
node packages/core/src/reconstruction/reports/generate-pnpm-license-summary.mjs
```

On older PowerShell without `utf8NoBOM`, run this script after export; it strips BOM and rewrites normalized JSON.
