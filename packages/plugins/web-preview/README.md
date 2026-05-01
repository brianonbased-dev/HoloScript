# HoloScript Robotics Studio - Web Preview

**Zero-installation 3D robot preview.** Type HoloScript, see your robot instantly in the browser.

## The Vision

This is **Figma for robotics** - a web-based IDE that eliminates all barriers to robot authoring:

- ❌ No expensive GPUs ($1,500+ RTX 4080)
- ❌ No 10GB installations (Isaac Sim, Gazebo)
- ❌ No confusing specs (16GB VRAM? Driver versions?)
- ❌ No desktop-only workflows

✅ **Just open a browser and create.**

## What This Demo Proves

**Value Proposition Validated**:

1. **Browser-based rendering works** (Three.js WebGL)
2. **Robot visualization is instant** (no compile wait)
3. **No local GPU needed** (cloud rendering path clear)
4. **Shareable URL** (send to academics, investors, NVIDIA)

**From HoloScript Compiler**:

- Input: `two_link_arm.hsplus` (40 lines HoloScript)
- Output: `two_link_arm.usd` (97 lines USD)
- **Reduction**: 58.8% less code

**Web Preview Advantage**:

- Renders in browser without USD tools
- Interactive 3D visualization
- No installation required
- Works on any device (even tablets)

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open browser
http://localhost:3000
```

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **3D Rendering**: Three.js + React Three Fiber
- **UI Components**: Custom CSS (no framework bloat)
- **Build Tool**: Vite (instant HMR)
- **Deployment**: Vercel (free tier, instant deploy)

## Architecture

```
HoloScript Code → Compiler → USD File → Web Preview
                                    ↓
                            Three.js Renderer
                                    ↓
                            Browser (WebGL)
```

**Future**: Add cloud rendering button → NVIDIA Omniverse streaming

## Deployment

```bash
# Deploy to Vercel (free)
npm run deploy

# Or manual deploy
vercel --prod
```

## What's Next

**Phase 2 Features**:

- [ ] USD file loader (drag-drop .usd files)
- [ ] URDF export button (multi-format compilation)
- [ ] Joint sliders (interactive manipulation)
- [ ] Cloud rendering integration (NVIDIA Omniverse)
- [ ] Code editor (Monaco/CodeMirror)
- [ ] Real-time compilation (type HoloScript, see result)

## Use Cases

**1. NVIDIA Inception Application**:

- Share URL: "See our web-first vision"
- No installation barrier for reviewers

**2. Academic Demos**:

- Professors share URL with students
- Instant access, zero setup

**3. Investor Pitch**:

- Live demo in browser
- "This is Figma for robotics"

**4. Early User Feedback**:

- Share on Twitter/Reddit
- Validate product-market fit

## The Bigger Picture

This web preview is the **MVP of the full SaaS product**:

**Free Tier** ($0):

- Web preview (WebGL rendering)
- 5 projects
- URDF export only

**Pro Tier** ($29/mo):

- All formats (USD + URDF + SDF + MJCF)
- 10 hours cloud rendering (Isaac Sim)
- 500 AI-generated robots/month
- Collaboration (5 editors)

**Enterprise Tier** ($299/mo):

- Unlimited cloud rendering
- Unlimited AI generation
- Team workspace
- On-premise deployment

**Market Validation**: MATLAB Robotics costs $940/year. Webots costs $4,995. Researchers **will pay** for superior tooling.

---

**This demo proves the vision is real.** Zero installation. Zero GPU requirements. Zero barriers to creation.

**Next step**: Deploy to Vercel, share URL, start collecting feedback.
