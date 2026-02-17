# HoloScript Package Certification

The HoloScript Certification Program recognizes packages that meet rigorous standards of quality, security, documentation, and maintenance.

## Certification Levels

| Level | Min Score | Badge |
|-------|-----------|-------|
| 🥉 **Bronze** | 60/100 | `@holoscript/certified-bronze` |
| 🥈 **Silver** | 75/100 | `@holoscript/certified-silver` |
| 🥇 **Gold** | 85/100 | `@holoscript/certified-gold` |
| 💎 **Platinum** | 95/100 | `@holoscript/certified-platinum` |

Badges are valid for **12 months** and must be renewed annually.

---

## Certification Requirements

### 1. Code Quality (25 points)

| Check | Points | Description |
|-------|--------|-------------|
| TypeScript typed | 5 | All exports fully typed, no `any` in public API |
| No lint errors | 5 | Passes `eslint` with `@holoscript/eslint-config` |
| Complexity score A/B | 5 | Cyclomatic complexity ≤ 10 per function |
| Test coverage ≥ 80% | 5 | Line + branch coverage ≥ 80% |
| No code duplication | 5 | < 3% duplicated blocks (jscpd) |

### 2. Documentation (25 points)

| Check | Points | Description |
|-------|--------|-------------|
| README with examples | 8 | Has Installation, Usage, and at least one code example |
| API documentation | 7 | All exported symbols have JSDoc comments |
| Changelog maintained | 5 | `CHANGELOG.md` in Keep a Changelog format |
| License clear | 3 | `LICENSE` file present and SPDX identifier in package.json |
| HoloScript compatibility table | 2 | Indicates which HoloScript versions are supported |

### 3. Security (25 points)

| Check | Points | Description |
|-------|--------|-------------|
| No known vulnerabilities | 10 | `npm audit` returns 0 high/critical issues |
| No suspicious network calls | 5 | No undeclared external HTTP calls |
| Safe dependency tree | 5 | All dependencies are themselves certified or well-known |
| Content Security Policy compliant | 3 | No `eval`, `new Function`, dynamic `import()` in browser builds |
| Input validation | 2 | Public API validates inputs (no injection vectors) |

### 4. Maintenance (25 points)

| Check | Points | Description |
|-------|--------|-------------|
| Responsive maintainer | 8 | Average issue response time < 7 days (last 90 days) |
| Regular updates | 7 | At least one non-patch release in last 12 months |
| Semantic versioning | 5 | All releases follow semver (no breaking changes in minor) |
| CI passing | 3 | GitHub Actions / CI shows green badge on default branch |
| Issue triage < 7 days | 2 | Bug reports triaged within 7 calendar days |

---

## Applying for Certification

### Prerequisites

Before applying, ensure your package:

1. Is published to npm or HoloHub
2. Has been downloaded ≥ 10 times
3. Has at least one release tagged on GitHub

### Application Process

```bash
# 1. Install the certification CLI
npm install -g @holoscript/certify

# 2. Run the automated checks locally
holoscript certify check ./my-package

# 3. View your score and required fixes
holoscript certify report

# 4. Submit for review
holoscript certify submit --package @myorg/my-package --version 1.0.0
```

### What Happens Next

1. **Automated scan** (immediate) — All automated checks run within 5 minutes
2. **Manual review** (if score ≥ 70) — A human reviewer checks documentation and API quality within 5 business days
3. **Badge issued** — If certified, the badge appears on HoloHub and you receive an email with the badge SVG + markdown

### Sample Report

```
@myorg/vr-buttons@2.0.0 — Certification Report
================================================

Code Quality         22/25  ✓
  ✓ TypeScript typed          5/5
  ✓ No lint errors            5/5
  ✓ Complexity A/B            4/5  ← 3 functions with complexity > 8
  ✓ Test coverage 83%         5/5
  ⚠ Code duplication 4.2%     3/5

Documentation        24/25  ✓
  ✓ README with examples      8/8
  ✓ API documentation         7/7
  ✓ Changelog maintained      5/5
  ✓ License clear             3/3
  ✗ No compat table           0/2

Security             23/25  ✓
  ✓ No vulnerabilities       10/10
  ✓ No suspicious calls       5/5
  ✓ Safe dependencies         5/5
  ✓ CSP compliant             3/3
  ✗ Input validation missing  0/2

Maintenance          18/25  ✗  ← Below required for Gold
  ✓ Responsive (3d avg)       8/8
  ✓ Regular updates           7/7
  ✗ No CI configured          0/3
  ✓ Semantic versioning       5/5
  ✗ Issue triage 12d avg      0/2

─────────────────────────────────
TOTAL:  87/100  →  🥇 GOLD
```

---

## Displaying Your Badge

After certification, add the badge to your README:

### SVG Badge (recommended)

```markdown
[![HoloScript Certified Gold](https://holoscript.dev/badge/@myorg/my-package/2.0.0.svg)](https://holoscript.dev/certified/@myorg/my-package)
```

### Text Badge

```markdown
![HoloScript Gold](https://img.shields.io/badge/HoloScript-Certified%20Gold-FFD700?style=flat-square)
```

### In package.json

```json
{
  "holoscript": {
    "certified": {
      "level": "gold",
      "score": 87,
      "issuedAt": "2026-06-01",
      "expiresAt": "2027-06-01",
      "fingerprint": "a1b2c3..."
    }
  }
}
```

---

## Renewal

Badges expire after **12 months**. To renew:

```bash
holoscript certify renew --package @myorg/my-package
```

Renewal runs the same automated checks against the latest published version.

---

## Appeals

If your certification is denied and you believe the automated checks are incorrect:

1. Open an issue on [github.com/holoscript/holoscript](https://github.com/holoscript/holoscript) with label `certification-appeal`
2. Include the certification report output
3. Explain why you believe the check result is incorrect

Appeals are reviewed within 5 business days.

---

## Certified Packages

Browse certified packages at [holoscript.dev/certified](https://holoscript.dev/certified).

| Package | Level | Score | Certified |
|---------|-------|-------|-----------|
| `@holoscript/core` | 💎 Platinum | 98 | 2026-03-01 |
| `@holoscript/lsp` | 💎 Platinum | 96 | 2026-03-15 |
| `@holoscript/visual` | 🥇 Gold | 91 | 2026-03-15 |
| `@holoscript/security-sandbox` | 💎 Platinum | 97 | 2026-02-20 |
| `@holoscript/llm-provider` | 🥇 Gold | 88 | 2026-03-01 |

---

## Certification API

Integrate certification into your CI pipeline:

```typescript
import { CertificationChecker } from '@holoscript/registry/certification';
import { issueBadge, verifyBadge } from '@holoscript/registry/certification/badge';

const checker = new CertificationChecker();
const result = await checker.check(myPackage);

if (result.certified) {
  const badge = issueBadge(pkg.name, pkg.version, result);
  console.log(`Certified at ${badge?.level} level (score: ${badge?.score}/100)`);
}
```

See the [API reference](/api/) for full documentation.
