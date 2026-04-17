# Domain Registration Plan — Spatial Sovereignty

**Last updated**: 2026-04-17
**Status**: Prep only — registration requires user's Namecheap + payment
**Priority**: 🟡 Medium (cheap insurance, do before the positioning piece goes public)

---

## Context

The competitive brief (`competitive-brief-2026-04-17.md`) recommends claiming **"Spatial Sovereignty"** as HoloScript's positioning narrative. The positioning doc (`positioning-spatial-sovereignty.md`) recommends registering defensive domains *before* publishing the founding manifesto, so squatters don't land there after the term gains traction.

This document is the shopping list. Hand it to Namecheap (or registrar of choice) and check out.

---

## Primary Target (must register)

### `spatial-sovereignty.net`
- **TLD choice**: `.net` fits the agent/protocol positioning; `.com` is the consumer equivalent
- **Estimated cost**: $10-15/yr at Namecheap
- **Purpose**: Canonical home for the Spatial Sovereignty narrative. Redirects to holoscript.net/spatial-sovereignty for now; can become a dedicated page later.
- **Priority**: 🔴 Register first

### `spatial-sovereignty.com`
- **TLD choice**: Consumer-facing term, brand protection
- **Estimated cost**: $10-15/yr
- **Purpose**: Block squatters from capturing `.com` and charging extortion prices later
- **Priority**: 🔴 Register first (same transaction as `.net`)

---

## Secondary Targets (register if budget allows)

These are defensive — cheap insurance against brand hijacking.

| Domain | Purpose | Cost/yr | Priority |
|---|---|---|---|
| `spatial-sovereignty.org` | Non-profit / standards-body connotation | $10-15 | 🟡 Medium |
| `spatialsovereignty.com` | No-hyphen variant (common typo target) | $10-15 | 🟡 Medium |
| `spatialsovereignty.net` | No-hyphen variant | $10-15 | 🟡 Medium |
| `spatial-sovereignty.io` | Developer-signaling TLD | $35-60 | 🟢 Low |
| `spatial-sovereignty.dev` | Dev-focused, Google-controlled TLD | $12-18 | 🟢 Low |
| `spatial-sovereignty.ai` | AI-era TLD, pricey but relevant | $90-150 | ⚪ Skip unless budget permits |

---

## Companion Terms (optional)

The positioning also introduces **"Verifiable Digital Twin"** (`positioning-verifiable-digital-twin.md`). Consider registering these too:

| Domain | Priority | Notes |
|---|---|---|
| `verifiable-digital-twin.com` | 🟡 Medium | Category-creation term; cheap insurance |
| `verifiable-digital-twin.net` | 🟡 Medium | Same |
| `verifiabledigitaltwin.com` | 🟢 Low | No-hyphen variant |

---

## Pre-Registration Checks

Before paying, run these checks to avoid surprises:

### 1. Existing registrations
```bash
# Check WHOIS via command line
whois spatial-sovereignty.com
whois spatial-sovereignty.net

# Or via web: https://lookup.icann.org/lookup
```

If any are already taken, note the registrant and expiration. Squatter-held domains may be worth a cheap offer (<$500); corporate-held ones are off-limits.

### 2. Trademark conflicts
- USPTO TESS search: [tmsearch.uspto.gov](https://tmsearch.uspto.gov)
- Search "spatial sovereignty" across all classes
- Look for class 9 (software), 42 (tech services), 41 (education/publishing)

If a live trademark exists, **do not register the domain**. Pivot to a fallback term (see below).

### 3. Social handle availability
Check on:
- X/Twitter: @SpatialSovereign / @SpatialSov
- GitHub: spatial-sovereignty org
- LinkedIn company page

Grab matching handles at the same time as domains. Handles are free; they prevent squatters too.

---

## Fallback Terms (if Sovereignty is trademarked or tests poorly)

Per `positioning-spatial-sovereignty.md`, alternates to consider:

| Fallback term | Tone | Domains to also consider |
|---|---|---|
| "Spatial Source" | Calmer, technical | spatial-source.com, spatial-source.net |
| "Spatial IR" | Compiler-native, nerdy | spatial-ir.com, spatial-ir.dev |
| "Portable Spatial" | Descriptive, plain | portable-spatial.com |

Register defensively on your primary term first; only pivot to fallbacks if the primary fails validation.

---

## Registrar Recommendations

| Registrar | Pros | Cons | Recommendation |
|---|---|---|---|
| **Namecheap** | Cheap, no upsells, good DNS UX | Support can be slow | 🟢 Recommended for personal use |
| **Cloudflare** | Wholesale pricing (no markup) | Requires Cloudflare DNS | 🟢 Good for high-volume |
| **Porkbun** | Free WHOIS privacy, API-friendly | Less mainstream | 🟡 Alternative |
| **Google Domains** | Simple | Discontinued; migrated to Squarespace | ❌ Avoid |
| **GoDaddy** | Ubiquitous | Aggressive upselling, higher renewal prices | ❌ Avoid |

---

## Recommended Configuration (post-registration)

Once registered:

### DNS
- **A record** or **CNAME** → `holoscript.net` (temporary 301 redirect)
- **TXT record** — SPF, DMARC set to reject (no email use initially)
- **WHOIS privacy** — enable (most registrars include free)

### Auto-renew
- Enable auto-renew on **all** registered domains
- Set calendar reminder for 60 days before first renewal (verify registrar contact info stays current)

### Forwarding
- `spatial-sovereignty.net` → `holoscript.net/spatial-sovereignty` (301 permanent)
- All other defensive domains → same destination

---

## Total Budget

| Tier | Domains | Est. Annual Cost |
|---|---|---|
| **Must-register** | `.net` + `.com` hyphenated | $20-30 |
| **Plus defensives** | + `.org`, no-hyphen variants | $60-90 |
| **Plus companion terms** | + verifiable-digital-twin.* | $100-130 |
| **Full defensive posture** | + .io, .dev, .ai | $250-400 |

**Recommended starting point**: $60-90/year (must-register + defensives). Expand if the positioning gains traction.

---

## Action Items for the User

1. [ ] Run the WHOIS + TESS checks above (5 min)
2. [ ] Log into Namecheap (or preferred registrar)
3. [ ] Register must-register tier (`spatial-sovereignty.net` + `.com`) — $20-30
4. [ ] Register defensives if budget allows — $60-90 total
5. [ ] Set DNS to 301-redirect to holoscript.net/spatial-sovereignty
6. [ ] Enable auto-renew on all
7. [ ] Grab matching social handles (X, GitHub, LinkedIn)
8. [ ] Add domains to `docs/strategy/domain-registry.md` (if not yet tracked) — mirrors ai-ecosystem `R.011 Domain Registry`
9. [ ] Set calendar reminder for pre-renewal verification (60 days out)

## Notes for future sessions

- If domains need to be programmatically configured, Namecheap API + Cloudflare API both support DNS + redirect automation. See W.GOLD.034 for pattern on authenticated Railway-style API flows.
- If the Spatial Sovereignty term gains analyst mention (Gartner, Forrester), bump priority to register remaining defensives within 48h.
