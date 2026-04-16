---
name: frontend
description: >
  Build interfaces by describing what you want, not how to code it.
  Say "I need a dashboard with three stat cards" — get a working UI for screens,
  VR headsets, and holograms from one description. See something wrong? Click it,
  leave a note, it gets fixed. No coding required. No framework knowledge needed.
argument-hint: "[build|fix|check|improve] [what you want in plain language]"
project-dir: C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Task, WebFetch
disable-model-invocation: false
context: fork
agent: general-purpose
---

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOLOFRONTEND — DESCRIBE IT. WE BUILD IT.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**What you asked for**: $ARGUMENTS
**Where it goes**: HoloScript Studio
**How it works**: You describe. We compose. It runs everywhere.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## THE PROBLEM WE SOLVE

Building interfaces is broken. You need to know React to make a web page,
Unity to make it work in VR, Swift to put it on Vision Pro — and if you
want all three, you build it three times. Most people never start because
the first step is "learn to code."

HoloScript fixes this: **describe what you want, and it works everywhere.**

Not "it compiles to many targets" — nobody cares about compilation targets.
It **runs**. On your screen, in a headset, on a hologram. If a compiler
exists for your platform, great — it runs optimized. If not, the runtime
interprets it directly. Either way, your thing works. You never see the
difference.

**Three ways to use this:**

1. **Say what you want**: "Build me a dashboard with agent stats and a chat panel"
2. **Point at what's wrong**: Click anything on screen, leave a note like
   "make this bigger" — it gets fixed without you touching code
3. **Ask for better**: "Make this faster" or "Does this work for colorblind users?"

---

## THE ZERO-CLICK LAW

**Every click you ask a user to make cuts your audience in half.**

This isn't a preference. It's physics. Funnels have gravity and every
interaction is a trapdoor:

| Clicks to goal | Who's still here | What that feels like |
|----------------|-----------------|---------------------|
| 0 (it just works) | Almost everyone | "This reads my mind" |
| 1 | 4 out of 5 | "That was easy" |
| 2 | 3 out of 5 | "Okay, getting there" |
| 3 | 2 out of 5 | "Is this worth it?" |
| 5+ | Less than 1 in 5 | Already gone. Tab closed. |

### What this means for every decision

**Defaults over options.** If most users want the same thing, don't show
a picker. Just do it. Put the edge case in settings, not in the flow.

**Progressive disclosure.** Show the simplest version first. Advanced
options appear only when someone reaches for them — never before.

**One action per screen.** Every page should have ONE obvious thing to do
next. If there are two equal choices, you haven't designed it yet.

**Automate the obvious.** If the system can infer what the user wants
(from context, from their last action, from what most users do), skip
the question entirely.

**Undo over confirm.** "Are you sure?" dialogs tax every user to protect
the rare misclick. Instead: do it immediately, offer undo for 5 seconds.

**Inline over modal.** Every modal is a context switch. Edit in place.
Expand in place. Confirm in place. Modals are for truly destructive,
irreversible operations only.

### For agents building UI

```
BEFORE adding any interactive element, ask:
  1. Can this be automated? (skip the click entirely)
  2. Can this be a smart default? (do it, let them change later)
  3. Can this be inline? (no modal, no new page, no dropdown)
  4. Is this the ONLY action on screen? (if not, demote the others)

NEVER:
  - Add a confirmation dialog for reversible actions
  - Show an empty state with just "Create New" — prefill with a template
  - Require login before showing value — show the product first
  - Put the primary action below the fold
  - Use a multi-step wizard when a single smart form works
  - Add a settings page when a sensible default exists
  - Show a loading spinner with no context (say WHAT is loading)

ALWAYS:
  - Prefill forms with smart defaults (last used, most common, AI-inferred)
  - Auto-save (never make the user click Save)
  - Show results immediately, refine in background
  - Put the primary action where the user's eyes already are
  - Collapse advanced options behind "More" — not in a separate page
  - Use skeleton screens instead of spinners (perceived speed)
  - Let one annotation fix multiple instances of the same issue
```

### Measuring it

After building any flow, count the clicks from "I want to do X" to "X is done."
If it's more than 3, redesign. The best flows are 0-1 clicks.

---

## FOR AGENTS: HOW TO PROCESS REQUESTS

> **BLOCKING REQUIREMENT — ABSORB GATE**: Before taking ANY action (writing, editing, reading files, building a composition, fixing a component), you MUST run `absorb_query` for the area you are about to touch. Do NOT proceed with any step below until the query returns results. This is non-negotiable — skipping it means building on assumptions, not truth. If the absorb service is unreachable, fall back to targeted `grep`/`find` commands and note that absorb was unavailable.

### Before anything: Load Live Context

This skill has no hardcoded knowledge of the codebase. Everything it knows
comes from querying live sources. Run these BEFORE doing any work:

**1. What does the codebase actually look like right now?**

Query Absorb GraphRAG for the current state of whatever you're about to touch.
Don't guess what files exist or how they're structured — ask:
```bash
# Source credentials
ENV_FILE="${HOME}/.ai-ecosystem/.env"; [ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a

curl -X POST MCP tools (holo_query_codebase, holo_ask_codebase) — absorb MCP endpoint is down \
  -H "Authorization: Bearer $ABSORB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/call","params":{"name":"absorb_query","arguments":{"query":"Studio component architecture for [WHAT YOU ARE WORKING ON]","limit":5}}}'
```

This tells you: what files exist, how they're connected, what patterns are
already in use, and what would break if you changed something. It replaces
10 file reads and prevents wrong assumptions.

**2. Has anyone solved this problem before (or gotten burned trying)?**

Query the knowledge store for relevant patterns and known pitfalls:
```bash
curl -X POST https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search":"[WHAT YOU ARE WORKING ON]","limit":5,"workspace_id":"ai-ecosystem"}'
```

This returns wisdom (things that work), patterns (reusable approaches), and
gotchas (things that will bite you). If someone already hit a wall here,
you'll know before you hit it too.

**3. What do the current docs and READMEs say?**

Read the live source of truth — don't rely on stale snapshots:
```bash
# Studio README (if it exists)
cat C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/README.md 2>/dev/null

# Studio CHANGELOG (what changed recently)
cat C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/CHANGELOG.md 2>/dev/null | head -100

# Studio audit (known issues — may be outdated, verify before acting on it)
cat C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/STUDIO_AUDIT.md 2>/dev/null | head -50

# Recent git activity (what's been touched lately)
cd C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio && git log --oneline -20

# Package.json (current dependencies and scripts)
cat C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/package.json | head -30
```

**Why this matters:** A skill that works from stale knowledge builds on
assumptions. A skill that loads live context builds on truth. The codebase
changes daily. What was true yesterday may not be true now.

**Scale the query to the change — but always run one.** Changing a button color? Run a targeted query for that specific component. Refactoring a whole page? Run a broader architecture query. The query can be narrow, but it must happen. Never assume you know what exists — the codebase is a moving target.

| Change size | Minimum absorb query scope |
|-------------|---------------------------|
| Single prop/style | `query: "[ComponentName] props and styling"` |
| Component behavior | `query: "[ComponentName] logic and dependencies"` |
| New feature | `query: "[feature area] architecture and existing patterns"` |
| Refactor/migration | `query: "[affected area] full component map and imports"` |

---

### Step 0: Check if the User Pointed at Something

Users can click anything on screen and leave a note. Before doing anything
else, check if they did:
```bash
curl -s http://localhost:3100/api/annotations
```

Each note tells you:
- **What they clicked** — the exact element on screen
- **What they said** — "make this bigger", "wrong color", etc.
- **How urgent** — blocking (must fix), important (should fix), suggestion (nice to have)
- **Where to find it in code** — CSS selector, component name, source file

Fix these first, in urgency order. After each fix, mark it done:
```bash
curl -X POST http://localhost:3100/api/annotations \
  -H "Content-Type: application/json" \
  -d '{"action":"resolve","sessionId":"SID","annotationId":"AID","resolvedBy":"agent"}'
```

### Step 1: Understand the Problem

Don't start with "what traits do I use." Start with:

1. **What problem is the user trying to solve?** ("I can't see my agent stats at a glance")
2. **Who will use this?** (Developer? Business owner? Someone in a VR headset?)
3. **What does 'done' look like?** (They see the stats. They make a decision. They move on.)
4. **How do we know it worked?** (They didn't need to ask a follow-up question.)

Then — and only then — figure out how to express it.

### Step 2: Write the Composition

HoloScript lets you describe WHAT something is, not HOW to build it.
The runtime figures out the how.

**The vocabulary is small on purpose.** You describe interfaces with traits —
each one solves a specific problem:

**"I need to show things on a screen":**

| Problem | Trait | What it solves |
|---------|-------|---------------|
| Group related content together | `@panel` | Creates a section — like a room in a house |
| Arrange things neatly | `@layout` | Rows, columns, grids — no manual positioning |
| Show text that matters | `@text` | Headings that stand out, body text that's readable |
| Let someone take action | `@button` | A clear, tappable target that does something |
| Collect information | `@input` | Text fields, dropdowns, toggles — with labels |
| Show a picture | `@image` | Optimized, accessible, properly sized |
| Elevate something important | `@card` | A raised surface that says "look at this" |
| Work on any screen size | `@responsive` | Adapts from phone to ultrawide without breaking |

**"I need this in 3D / VR / AR":**

| Problem | Trait | What it solves |
|---------|-------|---------------|
| Info that follows where I look | `@ui_floating` | Like a heads-up display — always in view, never in the way |
| A panel pinned to a spot in the room | `@ui_anchored` | Like a whiteboard on a wall — stays put when you walk around |
| Quick actions on my hand | `@ui_hand_menu` | Raise your palm, menu appears — no searching for buttons |
| A name tag that always faces me | `@ui_billboard` | Text that rotates to stay readable from any angle |
| A curved display (like Vision Pro) | `@ui_curved` | Content wraps around you — more natural than a flat rectangle |
| Let me move this where I want | `@ui_draggable` | Grab it, put it where it works for you |
| Let me resize this | `@ui_resizable` | Make it bigger to focus, smaller to get it out of the way |
| Scroll through a long list | `@ui_scrollable` | Swipe through content without the panel growing forever |

**Example — "I need to see my agent stats at a glance":**

```holo
composition "AgentDashboard" {
  object "dashboard" {
    @panel
    @layout(flex: "column", gap: "1.5rem", padding: "2rem")

    children {
      object "header" {
        @text(variant: "h1", content: "Your Agents")
      }

      object "stats" {
        @layout(grid: true, columns: 3, gap: "1rem")
        @responsive(sm: { columns: 1 }, md: { columns: 3 })

        object "active" {
          @card(hover: "lift")
          children {
            @text(variant: "h3", content: "12 running")
            @text(variant: "caption", content: "across 3 projects — 2 idle, 10 working")
          }
        }

        object "health" {
          @card(hover: "lift")
          children {
            @text(variant: "h3", content: "Healthy")
            @text(variant: "caption", content: "all agents responded in the last minute")
          }
        }

        object "attention" {
          @card(hover: "lift")
          children {
            @text(variant: "h3", content: "3 need you")
            @text(variant: "caption", content: "2 are stuck on ambiguous instructions, 1 hit an error")
          }
        }
      }
    }
  }
}
```

Notice: the cards don't say "12" and "8.5/10" and "3". They say what those
numbers MEAN. "12 running" tells you scale. "across 3 projects" tells you
distribution. "2 idle, 10 working" tells you if that's okay or not.
A number without context is noise.

**Example — "A chat panel that works in VR":**

```holo
composition "VRChat" {
  object "chatPanel" {
    @ui_floating(distance: 2.0, follow_delay: 0.3)
    @ui_draggable
    @ui_minimizable(minimize_to: "bottom-left")

    @panel
    @layout(flex: "column")

    children {
      object "messages" {
        @ui_scrollable(direction: "vertical")
        @list
      }

      object "input" {
        @layout(flex: "row", gap: "0.5rem")
        @input(type: "text", placeholder: "Type a message...")
        @button(variant: "primary", content: "Send")
      }
    }
  }
}
```

This works on a screen (flat panel), in VR (floating in space), and in
AR (anchored to your room). Not because we compiled it three times —
because the runtime knows what "floating" means on each platform.

### Step 3: Run It

HoloScript is **runtime-first**. The composition you wrote IS the program.
The runtime interprets it directly.

Compilers are an optimization — they translate your composition into
platform-native code (React, Unity, etc.) for better performance. But
they're not required. If a compiler breaks, the runtime still works.
The user never notices.

```
Runtime (always works)     → interprets .holo directly
Compiler (optimization)    → translates to React, Unity, VisionOS, etc.
                              if the compiler is available, we use it
                              if not, runtime handles it
                              the user sees no difference
```

For Studio specifically, the runtime renders via React and R3F in the browser.

### Step 4: Verify Visually

**Always screenshot before and after:**
```bash
npx playwright screenshot http://localhost:3100/ROUTE before.png --viewport-size="1440,900"
# ... apply changes ...
npx playwright screenshot http://localhost:3100/ROUTE after.png --viewport-size="1440,900"
```

### Step 5: Follow Through

Building it is half the job. Following through means:

- **Does it actually solve the problem?** (not "does it render" — does the USER
  get what they needed without asking again?)
- **Does it work on the worst-case device?** (phone with bad signal, not your dev machine)
- **What happens when it goes wrong?** (not just the happy path — the empty state,
  the error state, the slow network state)
- **Can the next person maintain it?** (if it's one giant file, the answer is no)

---

## WHAT YOU CAN ASK FOR

### Build something new
> "Build me a settings page with a profile form and theme toggle"
> "Create a way to browse scenario simulations"
> "Make a floating inspector for VR that shows object properties"

### Fix something that looks wrong
> Click it on screen and leave a note, or just say:
> "The sidebar is too wide on mobile"
> "The button colors don't match the rest of the page"
> "The text is hard to read on the dark background"

### Check quality
> "Is this page accessible for screen readers?"
> "Does this work on phones?"
> "How fast does this page load?"

### Improve what exists
> "Make this page load faster"
> "This file is too big to understand — break it up"
> "I shouldn't have to log in just to see what this does"

---

## QUALITY CHECKS (for agents)

When reviewing or building, verify:

**Does it solve the problem?**
- State the problem in one sentence before writing any code
- After building, can a user solve that problem without asking another question?
- If you removed all the UI chrome (headers, footers, nav), does the core still work?
- Does every number on screen have context? ("3 agents" means nothing. "3 agents
  need your attention — 2 stuck, 1 errored" means everything)

**Zero-Click Law:**
- Count clicks from intent to done — must be 3 or fewer (beyond 3, most users give up)
- Every form prefills with smart defaults (what would most users choose?)
- No confirmation dialogs for reversible actions (undo ribbon instead — 5 seconds to take it back)
- No empty states — always show a template, suggestion, or example (empty = dead end)
- Primary action visible without scrolling (if they can't see it, it doesn't exist)
- Auto-save everything (the user already told you what they want by typing — honor that)
- No login walls before showing value (show the product, THEN ask for signup)

**Usability:**
- Works on phone, tablet, and desktop (a phone user and a desktop user should both
  feel like it was designed for them, not adapted)
- Text is readable (white text on dark gray works. Light gray on white doesn't.
  Test: can you read it at arm's length?)
- Buttons are large enough to tap (the size of a fingertip, not a pencil point)
- Skeleton screens instead of spinners (a spinner says "wait." A skeleton says
  "here's what's coming" — brains process structure faster than motion)
- Error messages explain what went wrong AND what to do next ("Payment failed" is useless.
  "Card declined — try a different card or contact your bank" is actionable)
- One obvious action per screen (if two things compete for attention, neither wins)

**Accessibility:**
- Every image has alt text (screen reader users hear "image" for every unlabeled
  picture — imagine browsing blindfolded where every door is unmarked)
- Every form input has a label (not just a placeholder — placeholders disappear
  when you type, leaving you wondering "what was this field for?")
- Keyboard can reach everything (power users, screen readers, and anyone with a
  motor disability all navigate without a mouse)
- Focus indicator visible (when tabbing, you need to see where you are — removing
  the blue outline to "look cleaner" breaks navigation for millions of people)
- No information conveyed by color alone (colorblindness affects nearly 1 in 12 men
  — pair color with icons, text, or patterns)

**Performance:**
- Page loads fast on bad connections (after 3 seconds on mobile, more than half
  of users leave — that's someone on a bus with one bar of signal, not impatience)
- Long lists don't render what you can't see (showing a thousand items when only
  ten fit on screen is like printing an entire book to read one page)
- Heavy code loads only when needed (don't ship the chart library to everyone
  when only admins see the dashboard)

**Follow-through (the part most people skip):**
- What happens when there's no data? (empty states need to guide, not just say "nothing here")
- What happens when it errors? (every silent failure is a user staring at a blank screen)
- What happens on slow networks? (skeleton → content, not blank → spinner → content)
- Can someone else maintain this? (a file with a thousand lines is a file nobody
  wants to touch — if it's that big, it's doing too many things)

**Known issues — DON'T trust this list. Check live.**
This skill doesn't maintain a static list of known issues because they go
stale the moment someone fixes one. Instead:
```bash
# Check the audit file (if it exists) — but verify anything you act on
cat C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/STUDIO_AUDIT.md 2>/dev/null | head -30

# Or query the knowledge store for recent gotchas
curl -X POST https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search":"studio known issues","type":"gotcha","limit":10,"workspace_id":"ai-ecosystem"}'

# Or just check what's actually wrong right now
cd C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/src
grep -rn "as any" --include="*.tsx" --include="*.ts" | wc -l
grep -rn "\.catch(() => {})" --include="*.tsx" --include="*.ts" | wc -l
grep -rn "console\.\(log\|warn\|error\)" --include="*.tsx" --include="*.ts" | grep -v test | wc -l
```

---

## STUDIO MAP

Don't memorize these — run `ls src/app/` to see what pages actually exist.
Routes change. This table is a starting point, not a source of truth:

| Where | What problem it solves |
|-------|----------------------|
| `localhost:3100` | "What can I do here?" — entry point |
| `localhost:3100/create` | "I want to build a 3D scene" |
| `localhost:3100/workspace` | "Where are my projects?" |
| `localhost:3100/scenarios` | "I want to simulate something" |
| `localhost:3100/character` | "I need a character" |
| `localhost:3100/registry` | "What capabilities exist?" |
| `localhost:3100/settings` | "I want to change my preferences" |

---

## FINDING FILES (for agents)

**Don't memorize file paths. Query for them.**

The codebase changes daily. Instead of a static reference, use these to
find what you need in the moment:

```bash
# Find where a specific component lives
absorb_query '{"query": "where is the StudioHeader component defined"}'

# Find all trait definitions
find C:/Users/Josep/Documents/GitHub/HoloScript/packages/core/src/traits -name "*.ts" | head -20

# Find the click-to-fix system
grep -rn "useAgentation\|annotations" C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/src --include="*.ts" --include="*.tsx" -l

# Find example .holo UIs
find C:/Users/Josep/Documents/GitHub/HoloScript/packages/components -name "*.holo" 2>/dev/null

# Find the runtime
find C:/Users/Josep/Documents/GitHub/HoloScript/packages/core/src -name "*runner*" -o -name "*runtime*" 2>/dev/null

# Find recent changes (what's hot right now)
cd C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio && git log --oneline --since="3 days ago"

# Read the current README for up-to-date context
cat C:/Users/Josep/Documents/GitHub/HoloScript/packages/studio/README.md 2>/dev/null
```

**Working directory:** `C:\Users\Josep\Documents\GitHub\HoloScript\packages\studio`
Never write to `~/.ai-ecosystem`.

---

**HoloFrontend v5.0 — Live context, not stale snapshots.**
*Query the codebase. Read the docs. Check the knowledge store. Then build.*
*Nothing in this skill is a source of truth — the repo is.*
