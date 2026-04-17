# Competitive Monitoring Plan

**Last updated**: 2026-04-17
**Owner**: Marketing / founder
**Cadence**: Weekly scan + monthly deep review + quarterly refresh of full brief

---

## Purpose

The competitive brief (2026-04-17) identified 16 competitors across 4 fronts. That brief is a snapshot. This plan keeps it fresh.

**Core principle**: Set up lightweight automated feeds so threats surface before they require a panic response. Spend 30 minutes a week scanning, not 4 hours a month catching up.

---

## Tier 1: Daily / High-Frequency Signals

These need near-real-time awareness. Set up push alerts.

### GitHub release feeds
Subscribe (RSS or watch-releases) to:

- **BabylonJS/Babylon.js** — highest priority
- **mrdoob/three.js**
- **aframevr/aframe**
- **langchain-ai/langchain** + `langchain-ai/langgraph`
- **modelcontextprotocol/** (entire org — protocol evolution)
- **anthropics/courses** + anthropics/anthropic-sdk-* (our own upstream)

Action: Weekly 5-min scan. Note any agent/MCP/spatial feature additions.

### Blog feeds (RSS)
- **Windows Dev Blog** (Babylon announcements land here)
- **NVIDIA blogs** (Physical AI / Omniverse)
- **ANSYS blog**
- **Cursor changelog** (releasebot.io/updates/cursor)
- **LangChain blog**

### Social listening (Twitter/X)
Set up a saved search or list. Keywords to watch:
- "babylon.js" + "MCP"
- "three.js" + "agent"
- "omniverse" + "pricing"
- "ansys" + "browser"
- "cavrnus" (brand collision monitoring)
- "spatial sovereignty" (our term — alert on early adoption by anyone else)
- "verifiable digital twin" (same)

Action: Daily 2-min scan at session start.

---

## Tier 2: Weekly Scans

Check these once a week, typically Monday morning.

### Product pricing / tier pages
- simscale.com/product/pricing/
- forums.developer.nvidia.com (Omniverse pricing thread)
- cursor.com/pricing
- langchain.com/pricing
- ansys.com/products (release highlights)

Look for: pricing changes, new free tiers, enterprise floor shifts, feature gating changes.

### Job postings
Job pages reveal strategic priorities before products ship.

| Company | Page | What to watch |
|---|---|---|
| Babylon.js / Microsoft | careers.microsoft.com (filter: "Babylon") | MCP / agent roles = first-party elevation signal |
| NVIDIA | nvidia.com/en-us/about-nvidia/careers | "Physical AI developer advocate", "browser" roles |
| ANSYS | ansys.com/careers | SimAI / GeomAI expansion, browser / web roles |
| Cursor | cursor.com/careers | New agent types, non-code domain hires |
| SimScale | simscale.com/careers/ | Offline / on-prem roles (would signal pivot) |

Cadence: Weekly 10-min scan. Flag any role that suggests category expansion.

### Cursor marketplace
List of MCP servers at cursor.com/mcp (or wherever they publish it). Action: check for new "spatial", "simulation", "3D" entries. Submit HoloScript if not listed.

---

## Tier 3: Monthly Deep Review

Once a month, spend 30-45 minutes on:

### Analyst reports
- **Gartner Hype Cycle** — simulation, spatial computing, AI agents
- **Forrester Wave** — digital twin, agent platforms
- **IDC MarketScape** — CAE software, agent development
- Any report mentioning competitors by name

Action: Skim executive summaries; note any HoloScript category placement (or adjacent category creation).

### Review site sentiment trends
- **G2** — SimScale, Babylon.js, Cursor, ANSYS review trends
- **Capterra** — same
- **Product Hunt** — new launches in our space
- **TrustRadius** — enterprise reviews

Look for: emerging complaints (opportunities for us), emerging love (threats).

### Patent / trademark filings
- **USPTO TSDR** search for competitor filings
- Watch for: trademark applications on terms HoloScript uses (sovereignty, verifiable, etc.)

### Academic / preprint activity
- **arxiv.org** — simulation, spatial AI, agent frameworks
- **IEEE Xplore** — TVCG, VIS, VR venues
- Competitor papers = product roadmap preview

---

## Tier 4: Quarterly Full Refresh

Every three months:

1. Re-run the full competitive brief (competitive-brief-2026-04-17.md)
2. Update all 4 battlecards with latest positioning, pricing, features
3. Refresh the monitoring plan itself — add/remove competitors, new signals
4. Review with founder + strategy to align
5. Publish diff as a new daily-digest entry

Next full refresh: **2026-07-17**.

---

## Alert Thresholds — What Triggers an Escalation

Some signals need immediate response, not weekly scan.

### 🚨 Red alerts (respond within 48 hours)

- **Microsoft names Babylon MCP as first-party product** → respond with "What First-Party MCP Misses" counter-piece
- **NVIDIA announces browser-native Omniverse** → respond with "Browser AND verifiable" differentiation
- **Cursor adds first-party domain compiler feature** → respond with integration demo
- **ANSYS releases hash-verified replay** → publish TVCG paper + differentiation piece
- **Competitor adopts "spatial sovereignty" or "verifiable digital twin" framing** → escalate to founder; accelerate coining plans

### 🟠 Amber alerts (respond within 2 weeks)

- Competitor pricing drops 30%+ in our tier
- Competitor adds agent-native / MCP feature
- Competitor wins major vertical we're targeting (medical, legal, AV)
- Major analyst places us in competitor's category

### 🟡 Yellow alerts (note in weekly log)

- Competitor blog posts / case studies
- Feature announcements that don't overlap our wedge
- Job postings suggesting strategic drift
- Community sentiment shifts

---

## Tooling Recommendations

### Cheap / free
- **RSS reader** (Feedly, Inoreader) — free tier sufficient
- **Google Alerts** — "babylon MCP", "holoscript competitor", "spatial sovereignty", "verifiable digital twin"
- **Twitter/X saved searches** — free
- **GitHub watching** — release notifications
- **job page bookmarks** — manual weekly check

### Paid (when scale justifies)
- **Crayon** or **Klue** — automated competitive intel platforms ($5K-25K/yr)
- **Kompyte** — competitor tracking ($3K-15K/yr)
- **BuzzSumo** — content trend analysis ($100-300/mo)

### DIY via our stack
- **Absorb** — run quarterly scans on competitor open-source repos to surface architectural changes
- **HoloMesh** — cross-agent knowledge store for competitive intel graduated to team memory
- **Scheduled agents** — set up `/schedule` jobs to scan RSS feeds weekly and digest to `docs/daily-digests/`

---

## Ownership & Cadence

| Activity | Owner | Cadence | Duration |
|---|---|---|---|
| Tier 1 daily social scan | Founder | Daily | 2 min |
| Tier 1 weekly release scan | Founder | Weekly | 5 min |
| Tier 2 weekly pricing/jobs | Founder | Weekly | 10 min |
| Tier 3 monthly deep review | Founder | Monthly | 30-45 min |
| Tier 4 quarterly full refresh | Founder + strategy | Quarterly | Half-day |
| Red alert response | Founder | As triggered | 4-8 hours |

**Time budget**: ~30 min/week normal; 4-8 hours per quarterly refresh; as-needed for red alerts.

---

## Weekly Review Template

Every Monday, log the week's scan as a daily-digest entry:

```markdown
# Competitive Scan — [date]

## Red / Amber alerts
- [list or "none this week"]

## Tier 1 signals
- Babylon: [any notable release/post]
- Three.js: ...
- NVIDIA: ...
- ANSYS: ...
- Cursor: ...
- LangChain: ...
- Others: ...

## Tier 2 signals
- Pricing changes: ...
- Notable job postings: ...
- Cursor marketplace changes: ...

## Action items this week
- [ ] ...
```

Commit to `docs/daily-digests/YYYY-MM-DD-competitive-scan.md`. Graduate any recurring signals to knowledge store as W/P/G entries.

---

## What NOT to Monitor

Diminishing returns — don't waste time on:

- **Minor community forks** of major projects
- **Hobbyist experiments** that don't ship to production
- **Vaporware announcements** without shipping product
- **General AI hype** unrelated to spatial / simulation / agent-3D
- **Indirect adjacencies** (web frameworks, general dev tools)

Re-evaluate the scope quarterly. Cut aggressively.
