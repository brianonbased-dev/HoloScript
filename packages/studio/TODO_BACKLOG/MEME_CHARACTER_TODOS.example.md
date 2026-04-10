# TODO Backlog - Generated from Tests

**Generated**: 2026-02-26 14:30:00
**Total Items**: 17
**Source**: Scenario tests (`__tests__/scenarios/`)

## Summary

| Priority    | Count | Status    |
| ----------- | ----- | --------- |
| 🔴 Critical | 2     | 0 failing |
| 🟠 High     | 5     | 0 failing |
| 🟡 Medium   | 7     | 0 backlog |
| 🟢 Low      | 3     | 0 backlog |

---

## 🔴 Critical Priority (Fix Immediately)

### MEME-012: should load character in <500ms (degens have zero patience)

**Status**: 📋 backlog
**Estimate**: ⏱️ 4 hours
**Assignee**: Unassigned

**Description**: Optimize GLB loading with compression and caching

**Acceptance Criteria**: Characters load in under 500ms on average connection

**Related Files**:

- `GlbViewer.tsx`
- `loaderOptimizations.ts (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Speed Optimizations

---

### MEME-008: should export clip as MP4 for social media

**Status**: 📋 backlog
**Estimate**: ⏱️ 6 hours
**Assignee**: Unassigned

**Description**: Render animation to MP4 with transparent background

**Acceptance Criteria**: One-click export to 1080x1080 MP4 (TikTok format)

**Related Files**:

- `exporters/mp4Exporter.ts (new)`
- `ClipLibrary.tsx`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Viral Animation Recording

---

## 🟠 High Priority (This Sprint)

### MEME-001: should recognize meme character templates (Pepe, Wojak, Chad)

**Status**: 📋 backlog
**Estimate**: ⏱️ 3 hours
**Assignee**: Unassigned

**Description**: Add template detection for popular meme characters

**Acceptance Criteria**: Auto-apply meme-specific bones, traits, and animations

**Related Files**:

- `GlbDropZone.tsx`
- `characterStore.ts`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Character Import

---

### MEME-003: should add emoji reaction trait (floating emojis on trigger)

**Status**: 📋 backlog
**Estimate**: ⏱️ 5 hours
**Assignee**: Unassigned

**Description**: Create emoji-reaction trait for viral moments

**Acceptance Criteria**: Emojis (💀, 🔥, 😂, 💎) spawn and float up on event

**Related Files**:

- `traits/emojiReactionTrait.ts (new)`
- `traitRegistry.ts`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Meme-Specific Traits

---

### MEME-006: should auto-loop animations for infinite meme potential

**Status**: 📋 backlog
**Estimate**: ⏱️ 2 hours
**Assignee**: Unassigned

**Description**: Add loop detection and seamless loop generation

**Acceptance Criteria**: Animations seamlessly loop without jarring transitions

**Related Files**:

- `animationBuilder.ts`
- `ClipLibrary.tsx`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Viral Animation Recording

---

### MEME-007: should add audio sync for TikTok sounds

**Status**: 📋 backlog
**Estimate**: ⏱️ 8 hours
**Assignee**: Unassigned

**Description**: Import audio track and sync animation to beat/lyrics

**Acceptance Criteria**: Timeline shows waveform, markers for beat drops

**Related Files**:

- `AudioTimeline.tsx (new)`
- `audioSync.ts (new)`
- `characterStore.ts`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Viral Animation Recording

---

### MEME-013: should support hotkeys for viral workflow (R to record, S to stop)

**Status**: 📋 backlog
**Estimate**: ⏱️ 3 hours
**Assignee**: Unassigned

**Description**: Keyboard shortcuts for common meme creation actions

**Acceptance Criteria**: R=record, S=stop, SPACE=play, E=export, 1-9=preset poses

**Related Files**:

- `useHotkeys.ts (new)`
- `CharacterLayout.tsx`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Speed Optimizations

---

## 🟡 Medium Priority (Next Sprint)

### MEME-002: should show meme preset library (Pepe variants, Doge, Wojak)

**Status**: 📋 backlog
**Estimate**: ⏱️ 4 hours
**Assignee**: Unassigned

**Description**: Create preset library UI for one-click meme loading

**Acceptance Criteria**: Preset picker with 10+ popular meme characters

**Related Files**:

- `CharacterLayout.tsx`
- `PresetLibrary.tsx (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Character Import

---

### MEME-004: should add viral-pose trait (automatically hit trending poses)

**Status**: 📋 backlog
**Estimate**: ⏱️ 6 hours
**Assignee**: Unassigned

**Description**: Trait that cycles through viral poses (dab, floss, griddy)

**Acceptance Criteria**: Character auto-performs trending poses from library

**Related Files**:

- `traits/viralPoseTrait.ts (new)`
- `poseLibrary.ts (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Meme-Specific Traits

---

### MEME-009: should trigger animation on Discord reaction (via webhook)

**Status**: 📋 backlog
**Estimate**: ⏱️ 10 hours
**Assignee**: Unassigned

**Description**: Real-time animation trigger from Discord bot reactions

**Acceptance Criteria**: Character reacts when someone adds 🔥 emoji in Discord

**Related Files**:

- `integrations/discordWebhook.ts (new)`
- `reactionTriggerTrait.ts (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Meme Reactions & Triggers

---

### MEME-014: should batch render 10 meme variations in parallel

**Status**: 📋 backlog
**Estimate**: ⏱️ 8 hours
**Assignee**: Unassigned

**Description**: Mass produce meme variations with different materials/poses

**Acceptance Criteria**: Generate 10 variations of same character in 30 seconds

**Related Files**:

- `batchRenderer.ts (new)`
- `variationGenerator.ts (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Speed Optimizations

---

### MEME-015: should generate shareable link with embedded 3D viewer

**Status**: 📋 backlog
**Estimate**: ⏱️ 6 hours
**Assignee**: Unassigned

**Description**: Publish character to public URL with WebGL viewer

**Acceptance Criteria**: One-click publish, get shareable link for Twitter/Discord

**Related Files**:

- `api/publishCharacter.ts (new)`
- `ShareModal.tsx (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Social Sharing & Virality

---

## 🟢 Low Priority (Backlog)

### MEME-005: should add drip-shader trait (make it look expensive)

**Status**: 📋 backlog
**Estimate**: ⏱️ 4 hours
**Assignee**: Unassigned

**Description**: Holographic/chrome shader for that Web3 drip aesthetic

**Acceptance Criteria**: One-click shader that makes any character look 10x more expensive

**Related Files**:

- `shaders/dripShader.ts (new)`
- `materialPresets.ts`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Meme-Specific Traits

**Tags**: `shader`, `materials`

---

### MEME-010: should spawn confetti on Twitter quote tweet

**Status**: 📋 backlog
**Estimate**: ⏱️ 5 hours
**Assignee**: Unassigned

**Description**: Particle system triggered by social media events

**Acceptance Criteria**: Character celebrates when meme gets quote tweeted

**Related Files**:

- `integrations/twitterWebhook.ts (new)`
- `particleSystem.ts`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Meme Reactions & Triggers

---

### MEME-011: should flex on blockchain events (NFT mint, token pump)

**Status**: 📋 backlog
**Estimate**: ⏱️ 12 hours
**Assignee**: Unassigned

**Description**: Character performs victory dance on Web3 events

**Acceptance Criteria**: Listens to smart contract events, triggers animations

**Related Files**:

- `integrations/web3Listener.ts (new)`
- `contractEventTrait.ts (new)`

**Test Location**: `degen-meme-creator.scenario.ts` > Scenario: Degen Meme Creator — Meme Reactions & Triggers

**Tags**: `web3`, `blockchain`

---

## 📊 By Scenario

### Scenario: Degen Meme Creator — Character Import (2 items)

- **MEME-001**: should recognize meme character templates (Pepe, Wojak, Chad) (high)
- **MEME-002**: should show meme preset library (Pepe variants, Doge, Wojak) (medium)

### Scenario: Degen Meme Creator — Meme-Specific Traits (3 items)

- **MEME-003**: should add emoji reaction trait (floating emojis on trigger) (high)
- **MEME-004**: should add viral-pose trait (automatically hit trending poses) (medium)
- **MEME-005**: should add drip-shader trait (make it look expensive) (low)

### Scenario: Degen Meme Creator — Viral Animation Recording (3 items)

- **MEME-006**: should auto-loop animations for infinite meme potential (high)
- **MEME-007**: should add audio sync for TikTok sounds (high)
- **MEME-008**: should export clip as MP4 for social media (critical)

### Scenario: Degen Meme Creator — Meme Reactions & Triggers (3 items)

- **MEME-009**: should trigger animation on Discord reaction (via webhook) (medium)
- **MEME-010**: should spawn confetti on Twitter quote tweet (low)
- **MEME-011**: should flex on blockchain events (NFT mint, token pump) (low)

### Scenario: Degen Meme Creator — Speed Optimizations (3 items)

- **MEME-012**: should load character in <500ms (degens have zero patience) (critical)
- **MEME-013**: should support hotkeys for viral workflow (R to record, S to stop) (high)
- **MEME-014**: should batch render 10 meme variations in parallel (medium)

### Scenario: Degen Meme Creator — Social Sharing & Virality (3 items)

- **MEME-015**: should generate shareable link with embedded 3D viewer (medium)
- **MEME-016**: should watermark exported clips with creator signature (low)
- **MEME-017**: should integrate with Farcaster/Lens for on-chain memes (low)

---

## 🚨 Failing Tests (Urgent)

_No failing tests! ✅_

---

## 📋 Backlog Items

All 17 items are currently in backlog (see priority sections above)

---

## 📈 Effort Estimation

**Total Estimated Time**: 11 days, 7 hours (95 hours total)

| Priority | Estimated Time |
| -------- | -------------- |
| Critical | 10 hours       |
| High     | 21 hours       |
| Medium   | 34 hours       |
| Low      | 21 hours       |

---

## 🔗 Quick Links

- [Test Source](../../../__tests__/scenarios/)
- [Contributing Guide](../../CONTRIBUTING.md)
- [Project Roadmap](../../ROADMAP.md)

---

_This file was auto-generated by `todoGenerator.ts` from test execution._
_To update: Run `pnpm test scenarios` and TODOs will be regenerated._
