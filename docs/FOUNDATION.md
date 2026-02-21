# HoloScript Foundation

**Status**: In formation (Target: Q2 2026)

The HoloScript Foundation is a **neutral, community-driven nonprofit** governing the HoloScript meta-framework for spatial computing.

---

## Mission

**Build the commons-based infrastructure for spatial computing.**

HoloScript provides neutral, open-source tools for VR, AR, robotics, and digital twins. The Foundation ensures:
- ✅ **No owner advantage** - Even Hololand uses public APIs only
- ✅ **Community governance** - Major decisions via RFC process
- ✅ **Sustainable funding** - Corporate sponsors, grants, individual donations
- ✅ **Open ecosystem** - Anyone can build competing platforms

---

## Table of Contents

1. [Governance Structure](#governance-structure)
2. [Board & Committees](#board--committees)
3. [Decision-Making Process](#decision-making-process)
4. [Membership](#membership)
5. [Financial Transparency](#financial-transparency)
6. [RFC Process](#rfc-process)
7. [Roadmap](#roadmap)

---

## Governance Structure

### Legal Entity

**Entity Type**: 501(c)(3) Nonprofit Corporation (U.S.)
- Similar to: Linux Foundation, Apache Foundation, Rust Foundation
- **Tax Status**: Tax-exempt charitable organization
- **Governance**: Board of Directors + Technical Steering Committee

### Organizational Chart

```
┌─────────────────────────────────────────────────────────┐
│                    BOARD OF DIRECTORS                    │
│         (Fiduciary oversight, strategic direction)       │
│                                                          │
│  • 2 Platinum Sponsor Representatives                   │
│  • 2 Gold Sponsor Representatives                       │
│  • 1 Silver Sponsor Representative                      │
│  • 2 Community-Elected Members                          │
│  • 1 Executive Director (ex-officio, non-voting)        │
│                                                          │
│  Total: 8 members (7 voting, 1 non-voting)              │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
┌──────────▼────────┐ ┌───▼────────┐ ┌────▼──────────┐
│  TECHNICAL        │ │  COMMUNITY │ │   OPERATIONS  │
│  STEERING         │ │  COMMITTEE │ │   TEAM        │
│  COMMITTEE (TSC)  │ │            │ │               │
└───────────────────┘ └────────────┘ └───────────────┘
```

---

## Board & Committees

### Board of Directors

**Composition** (8 members):
- **2 Platinum Sponsor Reps** - Companies contributing $50K+/month
- **2 Gold Sponsor Reps** - Companies contributing $15K+/month
- **1 Silver Sponsor Rep** - Companies contributing $5K+/month
- **2 Community-Elected Members** - Elected annually by contributors
- **1 Executive Director** - Hired by board, ex-officio non-voting member

**Term**: 2 years, staggered (half elected each year)

**Responsibilities**:
- Set strategic direction
- Approve annual budget
- Hire/evaluate Executive Director
- Approve major partnerships
- Ensure financial sustainability

**Meetings**: Quarterly (public minutes published)

---

### Technical Steering Committee (TSC)

**Composition** (9 members):
- **3 Core Maintainers** - Elected by commit history (top contributors)
- **2 Gold Sponsor Technical Leads** - Appointed by Gold+ sponsors
- **2 Platform Representatives** - From platforms built on HoloScript (e.g., Hololand, VR training platforms)
- **2 Community Technical Members** - Elected by GitHub contributors

**Term**: 1 year, renewable

**Responsibilities**:
- Technical roadmap decisions
- RFC approval process
- Release planning (major versions)
- API stability guarantees
- Code review guidelines
- Compiler backend priorities

**Meetings**: Monthly (open to observers, public notes)

**Decision-Making**: Consensus-based; if consensus fails, 2/3 majority vote

---

### Community Committee

**Composition** (7 members):
- **1 Documentation Lead** - Elected by docs contributors
- **1 Events Coordinator** - Organizes conferences, meetups
- **2 Regional Representatives** - Americas, Europe, Asia-Pacific
- **1 Developer Experience Lead** - Tooling, DX improvements
- **1 Education Lead** - Tutorials, courses, onboarding
- **1 Diversity & Inclusion Lead** - Ensure inclusive community

**Term**: 1 year, renewable

**Responsibilities**:
- Community health and Code of Conduct enforcement
- Event planning (conferences, hackathons)
- Documentation quality
- Onboarding experience
- Grant program oversight (Community Grants)

**Meetings**: Bi-monthly (public notes)

---

### Operations Team (Paid Staff)

**Team** (5-7 people, hired by board):
- **Executive Director** (full-time) - Overall operations, fundraising, partnerships
- **Technical Project Manager** (full-time) - Coordinate TSC, manage releases
- **Community Manager** (full-time) - Discord, forums, events, grants
- **Developer Advocate** (full-time) - Content, tutorials, demos, support
- **Operations Coordinator** (part-time) - Finance, legal, admin

**Budget**: ~$800K-$1M annually (salaries + benefits)

---

## Decision-Making Process

### RFC (Request for Comments) Process

**For**: Major technical changes, new features, breaking changes, architecture decisions

**Process**:
1. **Draft RFC** - Author creates RFC doc in `holoscript/rfcs` repo
2. **Community Discussion** (2 weeks) - GitHub issue, Discord channel
3. **TSC Review** (1 week) - TSC members provide feedback
4. **Revision** - Author updates RFC based on feedback
5. **Final Comment Period** (1 week) - Last chance for objections
6. **TSC Decision** - Consensus approval or 2/3 vote
7. **Implementation** - Assigned to contributor or core team

**Examples of RFCs**:
- RFC-001: Add support for visionOS compilation target
- RFC-042: Breaking change to trait syntax (requires major version bump)
- RFC-103: Introduce official Rust SDK for HoloScript runtime

**Public Archive**: All RFCs published at [github.com/holoscript/rfcs](https://github.com/holoscript/rfcs)

---

### Board Decisions

**Requires Board Approval**:
- Annual budget ($2M+)
- Executive Director hiring/termination
- Major partnerships (>$100K value)
- Foundation legal structure changes
- Trademark/IP policy changes

**Process**:
1. **Proposal** - Staff or committee proposes to board
2. **Discussion** - Board meeting deliberation
3. **Vote** - Simple majority (4/7 voting members)
4. **Public Notice** - Published within 30 days

---

### Community Decisions

**Requires Community Vote** (open to all contributors):
- Community-elected board seats (2)
- Community-elected TSC seats (2)
- Code of Conduct changes
- Community grants >$10K

**Voting Eligibility**:
- 10+ commits to `holoscript/*` repos in past 12 months, OR
- 50+ hours documented contribution (docs, tutorials, support), OR
- Active maintainer of a platform built on HoloScript

**Process**:
- 2-week nomination period
- 2-week voting period (Condorcet method)
- Results published publicly

---

## Membership

### Corporate Members (Sponsors)

| Tier | Annual Cost | Benefits |
|------|-------------|----------|
| **Platinum** | $600K/year | 1 Board seat, 1 TSC seat, dedicated dev advocate (20% time), custom integration support (8 hrs/mo), major release naming rights |
| **Gold** | $180K/year | 1 Board seat (rotates among Gold sponsors), 1 TSC seat, integration support (4 hrs/mo), early access to experimental features |
| **Silver** | $60K/year | 1 Board seat (rotates among Silver sponsors), quarterly advisory calls, logo on website (top tier), co-marketing opportunities |
| **Bronze** | $12K/year | Logo on website, quarterly progress reports, Community Slack access |

**Current Sponsors** (as of Feb 2026): *Founding phase - accepting first sponsors*

---

### Individual Members (Contributors)

**Free Membership** - No dues required

**Tiers** (based on contribution):
- **Committer**: 10+ commits accepted in past 12 months
- **Maintainer**: Owns a package or compiler backend (e.g., Unity compiler, URDF generator)
- **Core Team**: Elected by TSC, <10 people, BDFL authority over specific domains

**Benefits**:
- Voting rights in community elections
- Invitations to contributor summits (2x per year)
- HoloScript Foundation swag
- Recognition on contributors page

---

## Financial Transparency

### Public Reporting

**Quarterly**:
- Revenue breakdown (sponsors, grants, donations)
- Expense breakdown (salaries, infrastructure, grants)
- Published on [foundation.holoscript.dev/finances](https://foundation.holoscript.dev/finances)

**Annually**:
- Form 990 (IRS nonprofit tax filing) - publicly available
- Audited financial statements
- Impact report (lines of code, contributors, platforms built, grants awarded)

**Budget Approval**: Board approves annual budget in Q4 for following year

---

### 2026 Budget (Projected)

| Category | Amount | % |
|----------|--------|---|
| **Salaries & Benefits** | $800K | 40% |
| **Infrastructure** (CI/CD, hosting, tools, legal) | $200K | 10% |
| **Community** (docs, events, marketing, grants) | $400K | 20% |
| **Research** (academic partnerships, experimental features) | $300K | 15% |
| **Reserve Fund** (6 months operating expenses) | $300K | 15% |
| **Total** | **$2M** | **100%** |

**Funding Goal**: $2M annually
- **Target**: 5 Platinum + 10 Gold + 20 Silver sponsors
- **Reality Check**: Start with 1-2 Platinum, 3-5 Gold, 10-15 Silver (Year 1)

---

### Grant Programs

**Budget**: $200K annually (from Community budget)

#### Platform Grants ($10K-$50K)
Build production platforms on HoloScript:
- VR training platforms
- Robotics simulation tools
- AR e-commerce apps
- Digital twin platforms

**Requirements**:
- Open-source (MIT license)
- Use public HoloScript APIs only
- Production deployment within 6 months
- Case study contribution

#### Research Grants ($5K-$25K)
Academic research:
- LLM + spatial computing integration
- Performance optimization techniques
- Novel DSL patterns for VR/AR

**Requirements**:
- Published paper or open-source implementation
- Co-authored with HoloScript Foundation

#### Community Grants ($1K-$5K)
Documentation, tutorials, tools:
- Video tutorial series
- "Build Your Own Platform" guides
- VS Code extension improvements
- Trait library expansions

**Requirements**:
- High-quality deliverable
- Benefits broad community

**Application**: [grants.holoscript.dev](https://grants.holoscript.dev) (Q3 2026)

---

## RFC Process

### RFC Repository

**Location**: [github.com/holoscript/rfcs](https://github.com/holoscript/rfcs)

### RFC Template

```markdown
# RFC-XXX: [Title]

**Status**: Draft | Under Review | Accepted | Rejected | Implemented

**Author**: @username

**Created**: YYYY-MM-DD

## Summary
One-paragraph explanation of the proposal.

## Motivation
Why are we doing this? What use cases does it support?

## Guide-level explanation
Explain the proposal as if teaching it to a HoloScript user.

## Reference-level explanation
Technical details: API changes, implementation approach, edge cases.

## Drawbacks
Why should we *not* do this?

## Rationale and alternatives
- Why is this design the best?
- What other designs were considered?
- What is the impact of not doing this?

## Prior art
How do other frameworks solve this problem?

## Unresolved questions
What parts of the design are still undecided?

## Future possibilities
What future work might build on this?
```

---

## Roadmap

### Phase 1: Formation (Q2 2026)
- [ ] Incorporate as 501(c)(3) nonprofit in Delaware
- [ ] Establish Board of Directors (founding members)
- [ ] Draft bylaws, Code of Conduct, IP policy
- [ ] Hire Executive Director
- [ ] Secure first 2-3 Platinum sponsors
- [ ] Set up financial infrastructure (bank account, accounting)

### Phase 2: Operations (Q3 2026)
- [ ] Hire Operations Team (5 people)
- [ ] Launch grant program ($200K allocated)
- [ ] First TSC election
- [ ] First community board seat election
- [ ] Publish Q1 financial report
- [ ] Host first contributor summit

### Phase 3: Growth (Q4 2026)
- [ ] Reach 10 total sponsors (1 Platinum, 4 Gold, 5 Silver)
- [ ] Award first 5 platform grants
- [ ] Publish first quarterly audit of Hololand (validate "even playing field")
- [ ] Launch public dashboard: [foundation.holoscript.dev](https://foundation.holoscript.dev)
- [ ] Secure 501(c)(3) tax-exempt status from IRS

### Phase 4: Maturity (2027+)
- [ ] Reach $2M annual budget (sustainable operations)
- [ ] 20+ sponsors across all tiers
- [ ] 10+ platforms built on HoloScript (proof of ecosystem)
- [ ] 100+ contributors (Committer level)
- [ ] Annual HoloScript Summit (1,000+ attendees)

---

## Inspiration & Models

HoloScript Foundation is modeled after successful open-source foundations:

| Foundation | What We Learned |
|------------|-----------------|
| **Linux Foundation** | Neutral governance, tiered sponsorship, diverse project portfolio |
| **Apache Foundation** | Meritocratic decision-making, strong IP protection, transparent processes |
| **Rust Foundation** | Corporate sponsor engagement, community-first culture, technical excellence |
| **LLVM Foundation** | Consortium model for compiler infrastructure, academic partnerships |
| **Cloud Native Computing Foundation (CNCF)** | Vendor-neutral platform, clear project lifecycle (sandbox → incubating → graduated) |

**Key Difference**: HoloScript Foundation governs a **single meta-framework** (not a portfolio), ensuring focus and API stability.

---

## Contact

**Founding Team**: [foundation@holoscript.dev](mailto:foundation@holoscript.dev)

**Sponsorship Inquiries**: [sponsorship@holoscript.dev](mailto:sponsorship@holoscript.dev)

**Grant Applications**: [grants@holoscript.dev](mailto:grants@holoscript.dev) (opens Q3 2026)

**Community**: [Discord](https://discord.gg/holoscript) | [GitHub Discussions](https://github.com/brianonbased-dev/HoloScript/discussions)

---

## FAQs

### Why a foundation instead of remaining indie?

**Answer**: Sustainability and neutrality. A foundation ensures:
1. HoloScript outlives any single person or company
2. No vendor lock-in (governed by diverse stakeholders)
3. Transparent decision-making
4. Predictable funding for maintenance and growth

### Can I contribute without being a sponsor?

**Yes!** The majority of contributors are individuals. You can:
- Contribute code (PRs to compiler backends, runtime, docs)
- Participate in RFC discussions
- Help in Discord/forums
- Write tutorials or build platforms on HoloScript
- Vote in community elections (if eligible)

### How do you prevent corporate capture?

**Safeguards**:
1. **Board diversity**: 2/8 board seats are community-elected (no sponsor affiliation)
2. **TSC independence**: 5/9 TSC seats are merit-based (not sponsor-appointed)
3. **RFC process**: Major technical decisions require community input
4. **Bylaws protection**: Changing governance requires 2/3 board + community vote

### What happens if a Platinum sponsor leaves?

**Answer**:
- Board seat becomes vacant → replaced by next-tier sponsor or community election
- Operations Team reduces scope if budget falls below threshold
- Reserve fund (6 months expenses) provides runway to find replacement

---

**Last Updated**: February 21, 2026
**Status**: Draft (pending incorporation)

---

*The HoloScript Foundation is committed to commons-based governance. We welcome scrutiny, suggestions, and participation.*

© 2026 HoloScript Foundation (in formation)
