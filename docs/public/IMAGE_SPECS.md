# HoloScript Documentation - Image & Thumbnail Specifications

**Last Updated:** 2026-02-26
**Status:** Specifications ready for design implementation

---

## Overview

This document specifies all images, thumbnails, and Open Graph (OG) cards needed for HoloScript documentation and social sharing.

---

## 1. Main Open Graph Image

**File:** `og-image.png`
**Dimensions:** 1200×630px (Facebook/Twitter recommended)
**Format:** PNG with transparency support
**Location:** `/docs/public/og-image.png`

### Content Requirements

**Primary Text:**

```
HoloScript
One Language, Every Platform
```

**Secondary Text:**

```
Semantic Traits (see NUMBERS.md)
45+ Compilation Targets
AI-Powered Development
```

**Visual Elements:**

- HoloScript logo (top-left or center)
- Abstract 3D/VR visual elements
- Platform icons: Unity, Unreal, Godot, visionOS, Quest
- Code snippet background (subtle, low opacity)
- Gradient: Cyan (#00ffff) to Purple/Magenta

**Typography:**

- Primary: Bold, modern sans-serif (Inter, Geist, or similar)
- Secondary: Regular weight
- Code: Monospace (JetBrains Mono, Fira Code)

**Color Palette:**

- Background: Dark (#0a0a0f → #1a1a2e gradient)
- Primary text: White (#ffffff)
- Accent: Cyan (#00ffff)
- Secondary accent: Magenta (#ec4899)

---

## 2. Tutorial-Specific OG Images

### 2.1 "Your First AI Scene" Tutorial

**File:** `og-first-ai-scene.png`
**Dimensions:** 1200×630px
**Location:** `/docs/public/tutorials/og-first-ai-scene.png`

**Content:**

```
Your First AI Scene
Build VR Scenes with Natural Language

✓ No coding required
✓ Brittney AI assistant
✓ 15 minutes to first scene
```

**Visual Elements:**

- Brittney AI chat interface mockup
- 3D viewport showing simple scene
- "Creator Mode" badge/icon
- Screenshot of Studio interface (subtle background)

**Primary Color:** Green (#10b981) for "beginner-friendly"

---

### 2.2 "Building Your First AI NPC" Tutorial

**File:** `og-first-ai-npc.png`
**Dimensions:** 1200×630px
**Location:** `/docs/public/tutorials/og-first-ai-npc.png`

**Content:**

```
Building Your First AI NPC
Create Intelligent Characters

@llm_agent • Tool Calling • Bounded Autonomy
```

**Visual Elements:**

- Shopkeeper NPC character (3D render or icon)
- Speech bubble with AI-generated dialog
- Code snippet showing `@llm_agent` trait
- LLM provider logos (OpenAI, Anthropic, small)

**Primary Color:** Blue (#3b82f6) for "technical but accessible"

---

### 2.3 "Studio IDE Reference" Guide

**File:** `og-studio-reference.png`
**Dimensions:** 1200×630px
**Location:** `/docs/public/tutorials/og-studio-reference.png`

**Content:**

```
HoloScript Studio
Complete IDE Reference

🎨 Creator • 🖌️ Artist • 🎬 Filmmaker
⚙️ Expert • 🦴 Character
```

**Visual Elements:**

- Studio interface overview (5-panel layout)
- Mode icons prominently displayed
- Keyboard shortcuts reference (small, bottom)
- Clean, professional documentation style

**Primary Color:** Purple (#8b5cf6) for "comprehensive reference"

---

## 3. Favicon Suite

**Current:** `/docs/public/logo.svg`
**Dimensions Required:**

- `favicon.ico` - 16×16, 32×32, 48×48 (multi-size ICO)
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png` - 180×180px
- `android-chrome-192x192.png` - 192×192px
- `android-chrome-512x512.png` - 512×512px

**Design Requirements:**

- Simple, recognizable at small sizes
- HoloScript "H" monogram or holographic cube
- Cyan (#00ffff) primary color
- Dark background or transparent

---

## 4. Tutorial Thumbnail Images

For use in tutorial cards/listings on the main guides page.

### Dimensions

- **Width:** 800px
- **Height:** 450px (16:9 aspect ratio)
- **Format:** PNG or WebP

### Required Thumbnails

#### 4.1 First AI Scene Thumbnail

**File:** `thumb-first-ai-scene.png`
**Content:** Brittney chat + 3D viewport preview
**Style:** Bright, inviting, beginner-friendly

#### 4.2 First AI NPC Thumbnail

**File:** `thumb-first-ai-npc.png`
**Content:** NPC character + code snippet
**Style:** Technical but approachable

#### 4.3 Studio Reference Thumbnail

**File:** `thumb-studio-reference.png`
**Content:** Studio interface overview
**Style:** Clean, professional, comprehensive

---

## 5. Feature Section Images

For use in landing page and documentation sections.

### 5.1 AI Features Hero

**File:** `feature-ai-hero.png`
**Dimensions:** 1600×900px
**Content:** Brittney AI + multi-agent visualization
**Usage:** AI features section hero image

### 5.2 Studio Modes Grid

**Files:**

- `mode-creator.png` (600×400px)
- `mode-artist.png` (600×400px)
- `mode-filmmaker.png` (600×400px)
- `mode-expert.png` (600×400px)
- `mode-character.png` (600×400px)

**Content:** Screenshot or illustration of each mode
**Usage:** Studio capabilities showcase

### 5.3 Platform Targets

**File:** `platform-targets.png`
**Dimensions:** 1200×600px
**Content:** Icons of all 25+ supported platforms
**Usage:** Cross-platform compilation showcase

---

## 6. Screenshot Requirements

### Studio Interface Screenshots

**Priority Screenshots Needed:**

1. **Creator Mode - Default View** (1920×1080px)
   - File: `screenshot-creator-mode.png`
   - Shows: Hierarchy panel, 3D viewport, Properties panel, Brittney chat

2. **Artist Mode - Shader Graph** (1920×1080px)
   - File: `screenshot-artist-mode.png`
   - Shows: Node-based shader editor with connected nodes

3. **Filmmaker Mode - Timeline** (1920×1080px)
   - File: `screenshot-filmmaker-mode.png`
   - Shows: Camera path timeline with keyframes

4. **Character Mode - Animation** (1920×1080px)
   - File: `screenshot-character-mode.png`
   - Shows: Skeleton FK editor with bones visible

5. **Expert Mode - Code Editor** (1920×1080px)
   - File: `screenshot-expert-mode.png`
   - Shows: Monaco editor with HoloScript code

6. **VR Mode** (1920×1080px)
   - File: `screenshot-vr-mode.png`
   - Shows: VR viewport with hand tracking visible

7. **Brittney Chat Panel** (800×600px)
   - File: `screenshot-brittney-chat.png`
   - Shows: Chat interface with example conversation

8. **Scene Generator Panel** (800×600px)
   - File: `screenshot-scene-generator.png`
   - Shows: Scene generation interface with templates

---

## 7. Logo Variations

### 7.1 Horizontal Logo

**File:** `logo-horizontal.png`
**Dimensions:** 400×100px (4:1 ratio)
**Background:** Transparent
**Usage:** Website headers, documentation headers

### 7.2 Vertical Logo

**File:** `logo-vertical.png`
**Dimensions:** 200×250px
**Background:** Transparent
**Usage:** Narrow sidebars, mobile headers

### 7.3 Logo with Tagline

**File:** `logo-with-tagline.png`
**Dimensions:** 600×150px
**Text:** "HoloScript - One Language, Every Platform"
**Usage:** Marketing materials, presentations

### 7.4 Monochrome Variations

**Files:**

- `logo-white.svg` - For dark backgrounds
- `logo-black.svg` - For light backgrounds
- `logo-cyan.svg` - Brand accent color

---

## 8. Social Media Assets

### 8.1 Twitter/X Card

**File:** `twitter-card.png`
**Dimensions:** 1200×675px (16:9)
**Content:** Same as main OG image but optimized for Twitter

### 8.2 LinkedIn Share

**File:** `linkedin-share.png`
**Dimensions:** 1200×627px
**Content:** Professional styling, emphasize developer tools

### 8.3 Discord Embed

**File:** `discord-embed.png`
**Dimensions:** 1280×720px
**Content:** Clean, readable at smaller sizes

---

## 9. Tutorial Step Illustrations

For inline documentation images showing specific features.

### Required Illustrations

1. **Transform Gizmos** (600×400px each)
   - `gizmo-move.png` - Move (translate) gizmo
   - `gizmo-rotate.png` - Rotate gizmo
   - `gizmo-scale.png` - Scale gizmo

2. **Viewport Controls** (800×600px)
   - `viewport-controls.png` - Labeled diagram of mouse controls

3. **Trait Configuration** (600×400px)
   - `trait-config-example.png` - Properties panel showing trait settings

4. **Brittney Prompt Examples** (800×200px each)
   - `brittney-prompt-scene.png` - Scene generation example
   - `brittney-prompt-npc.png` - NPC creation example
   - `brittney-prompt-optimize.png` - Optimization example

---

## 10. Implementation Checklist

### Phase 1: Critical Images (Week 1)

- [ ] Main OG image (`og-image.png`) - **PRIORITY**
- [ ] Favicon suite (6 files)
- [ ] Tutorial OG images (3 files)
- [ ] Tutorial thumbnails (3 files)

### Phase 2: Screenshots (Week 2)

- [ ] Studio mode screenshots (6 files)
- [ ] Brittney UI screenshots (2 files)
- [ ] VR mode screenshot (1 file)

### Phase 3: Assets & Illustrations (Week 3)

- [ ] Logo variations (7 files)
- [ ] Feature section images (2 files)
- [ ] Platform targets graphic (1 file)
- [ ] Tutorial step illustrations (7 files)

### Phase 4: Social Media (Week 4)

- [ ] Twitter card (1 file)
- [ ] LinkedIn share (1 file)
- [ ] Discord embed (1 file)

---

## 11. Design Tools & Resources

### Recommended Tools

- **Figma** - UI mockups, OG images, thumbnails
- **Blender** - 3D renders (Studio interface, NPC characters)
- **Excalidraw** - Diagrams, illustrations
- **Canva** - Quick social media graphics
- **Photopea** - Image editing (Photoshop alternative)

### Asset Libraries

- **Icons:** Lucide Icons, Heroicons
- **3D Models:** Sketchfab (for NPC examples)
- **Gradients:** UIGradients.com
- **Platform Logos:** Official brand kits

### Color Palette (from brand)

```css
--primary-cyan: #00ffff;
--primary-magenta: #ec4899;
--bg-dark: #0a0a0f;
--bg-dark-secondary: #1a1a2e;
--text-white: #ffffff;
--text-gray: #9ca3af;
--accent-green: #10b981;
--accent-blue: #3b82f6;
--accent-purple: #8b5cf6;
```

---

## 12. File Organization

```
docs/public/
├── logo.svg                    # Main logo (existing)
├── base-logo.svg              # Base logo variant (existing)
├── og-image.png               # Main OG image (UPDATE NEEDED)
├── og-image.svg              # SVG version (existing)
├── favicon.ico               # Multi-size favicon (NEW)
├── favicon-16x16.png         # Small favicon (NEW)
├── favicon-32x32.png         # Medium favicon (NEW)
├── apple-touch-icon.png      # iOS home screen (NEW)
├── android-chrome-192x192.png # Android (NEW)
├── android-chrome-512x512.png # Android hi-res (NEW)
├── tutorials/
│   ├── og-first-ai-scene.png       # Tutorial OG (NEW)
│   ├── og-first-ai-npc.png         # Tutorial OG (NEW)
│   ├── og-studio-reference.png     # Reference OG (NEW)
│   ├── thumb-first-ai-scene.png    # Thumbnail (NEW)
│   ├── thumb-first-ai-npc.png      # Thumbnail (NEW)
│   └── thumb-studio-reference.png  # Thumbnail (NEW)
├── screenshots/
│   ├── creator-mode.png            # Studio screenshot (NEW)
│   ├── artist-mode.png             # Studio screenshot (NEW)
│   ├── filmmaker-mode.png          # Studio screenshot (NEW)
│   ├── character-mode.png          # Studio screenshot (NEW)
│   ├── expert-mode.png             # Studio screenshot (NEW)
│   ├── vr-mode.png                 # Studio screenshot (NEW)
│   ├── brittney-chat.png           # UI screenshot (NEW)
│   └── scene-generator.png         # UI screenshot (NEW)
├── features/
│   ├── ai-hero.png                 # Feature image (NEW)
│   ├── platform-targets.png        # Feature image (NEW)
│   └── modes/
│       ├── creator.png             # Mode image (NEW)
│       ├── artist.png              # Mode image (NEW)
│       ├── filmmaker.png           # Mode image (NEW)
│       ├── expert.png              # Mode image (NEW)
│       └── character.png           # Mode image (NEW)
└── illustrations/
    ├── gizmo-move.png              # Tutorial illustration (NEW)
    ├── gizmo-rotate.png            # Tutorial illustration (NEW)
    ├── gizmo-scale.png             # Tutorial illustration (NEW)
    ├── viewport-controls.png       # Tutorial illustration (NEW)
    └── trait-config-example.png    # Tutorial illustration (NEW)
```

---

## 13. Meta Tags Template

For each new tutorial page, add these meta tags:

```html
<meta property="og:title" content="[Tutorial Title] - HoloScript" />
<meta property="og:description" content="[Brief description, 2-3 sentences]" />
<meta property="og:image" content="https://holoscript.net/tutorials/[og-image-file]" />
<meta property="og:url" content="https://holoscript.net/guides/[tutorial-slug]" />
<meta property="og:type" content="article" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="[Tutorial Title] - HoloScript" />
<meta name="twitter:description" content="[Brief description]" />
<meta name="twitter:image" content="https://holoscript.net/tutorials/[og-image-file]" />

<meta name="description" content="[SEO-optimized description, 150-160 chars]" />
<meta name="keywords" content="holoscript, vr, ai, tutorial, [specific-keywords]" />
```

---

## 14. Priority Action Items

### Immediate (This Week)

1. **Update main OG image** with current trait/target counts from NUMBERS.md
2. **Create favicon suite** for better browser tab appearance
3. **Add meta tags** to new tutorial pages (code-only, no images needed yet)

### Short-Term (Next 2 Weeks)

4. **Capture Studio screenshots** for all 5 modes
5. **Create tutorial thumbnails** for guides index page
6. **Design tutorial-specific OG images**

### Long-Term (Month 1)

7. **Create feature illustrations** for landing page
8. **Design platform targets graphic**
9. **Create tutorial step illustrations** for inline docs

---

## 15. Notes for Designers

### Brand Voice

- **Modern** - Clean, contemporary design
- **Technical** - Professional developer tools aesthetic
- **Accessible** - High contrast, readable at all sizes
- **Futuristic** - Subtle sci-fi/VR elements

### Do's

✅ Use cyan (#00ffff) as primary brand color
✅ Maintain high contrast for accessibility
✅ Include actual Studio UI screenshots when possible
✅ Show code samples where relevant
✅ Use modern, clean typography

### Don'ts

❌ Don't use outdated stock photos
❌ Don't overcomplicate - keep it clean
❌ Don't use low-resolution assets
❌ Don't obscure text with busy backgrounds
❌ Don't deviate from brand colors without reason

---

**Questions?** Contact: docs@holoscript.net

**Last Review:** 2026-02-26
**Next Review:** 2026-03-26 (monthly)
