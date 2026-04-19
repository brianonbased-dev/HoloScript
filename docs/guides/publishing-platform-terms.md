# Publishing and platform terms

When you compile `.holo` / `.hs` / `.hsplus` to a **host engine or store**, HoloScript produces **technical artifacts** (scripts, scenes, shaders, manifests). **Legal and policy compliance for shipping** still belongs to **you** (the author or publisher) and the **platform vendor**.

This page is a **starting checklist** of official terms and guidelines. It is **not legal advice**. URLs change; verify the latest documents before you publish.

**Related:** Monorepo npm licenses are summarized in `packages/core/src/reconstruction/reports/pnpm-licenses-summary.md`. Destination platforms are **not** covered by that npm scan. For scope and ownership, see **Appendix B** in `packages/core/src/reconstruction/LINGBOT_FAMILY_LICENSE_AUDIT.md` (same repository).

---

## VRChat (Unity + SDK3)

HoloScript’s VRChat target emits **UdonSharp / SDK3-shaped** output. You still need a **VRChat-compatible Unity project**, the **VRChat Creator Companion**, and VRChat’s SDK, subject to their licenses and rules.

| Document | URL |
| -------- | --- |
| Legal hub (Terms of Service, links to SDK license, etc.) | https://hello.vrchat.com/legal |
| VRChat SDK license | https://hello.vrchat.com/legal/sdk |
| Community Guidelines | https://hello.vrchat.com/community-guidelines |
| Creator Guidelines | https://hello.vrchat.com/creator-guidelines |
| Copyright | https://hello.vrchat.com/copyright |
| Privacy Policy | https://hello.vrchat.com/privacy |

**Compiler docs:** [VRChat compiler](/compilers/vrchat) · [VRChat Unity workflow](/compilers/vrchat-unity-workflow)

---

## Unity (including VRChat’s Unity stack)

Unity Editor, runtime, packages, and services are governed by Unity’s legal documents (plan tier and use case matter).

| Document | URL |
| -------- | --- |
| Legal center | https://unity.com/legal |
| Terms of Service | https://unity.com/legal/terms-of-service |

**Compiler docs:** [Unity compiler](/compilers/unity)

---

## Unreal Engine

| Document | URL |
| -------- | --- |
| Unreal Engine EULA | https://www.unrealengine.com/eula |

**Compiler docs:** [Unreal compiler](/compilers/unreal)

---

## Godot

| Document | URL |
| -------- | --- |
| Godot license (engine) | https://godotengine.org/license/ |

Your **game** may bundle assets under other licenses; Godot’s license covers the engine, not your full shipping bundle.

**Compiler docs:** [Godot compiler](/compilers/godot)

---

## Web (WebGPU, Three.js, Babylon.js, React Three Fiber)

Browser apps are subject to **your hosting provider**, **user privacy regulations**, and the **licenses of JavaScript dependencies** you add beyond HoloScript output. HoloScript’s own npm dependency license snapshot is regenerated from the monorepo; **your** app’s `package.json` may differ.

| Resource | URL |
| -------- | --- |
| MDN Web docs (WebGPU standards context) | https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API |
| Three.js license (reference) | https://github.com/mrdoob/three.js/blob/dev/LICENSE |

**Compiler docs:** [WebGPU](/compilers/webgpu) · [Babylon](/compilers/babylon) · [Three.js](/compilers/three-js)

---

## Apple platforms (iOS, visionOS)

Apple Developer Program agreements and App Store / visionOS distribution rules apply when you ship to Apple devices.

| Document | URL |
| -------- | --- |
| Apple Developer agreements (overview) | https://developer.apple.com/support/terms/ |

**Compiler docs:** [iOS](/compilers/ios) · [visionOS](/compilers/vision-os)

---

## Android and XR (Google, OEM, Meta)

Store and device policies vary by **distribution channel** (Play Store, Quest Store, sideloading). Use the terms for the **exact** store and SDKs you integrate.

| Resource | URL |
| -------- | --- |
| Google Play Developer Program Policies (overview) | https://play.google.com/about/developer-content-policy/ |

**Compiler docs:** [Android](/compilers/android) · [Android XR](/compilers/android-xr)

---

## Where this page is linked

- **Docs:** [Guides index](./index.md), [Compilers index](../compilers/index.md), and per-target compiler pages (VRChat, Unity, Unreal, Godot).
- **HoloScript Studio:** Export panel footers (scene download) point here when you ship to engines or stores.
- **VS Code extension:** Command palette → **“HoloScript: Open Publishing & Platform Terms (VRChat, Unity, …)”** (`holoscript.openPublishingPlatformTerms`).

Published URL (when docs are deployed): `https://holoscript.net/guides/publishing-platform-terms`

## Maintaining this page

- When VRChat, Unity, or other vendors **move** legal URLs, update this file and (if needed) the audit appendix cross-link. Keep `packages/studio/src/lib/docsUrls.ts` and the VS Code extension command URL in sync with this path.
- For **HoloScript toolchain** dependency licenses, refresh the pnpm report (see `pnpm-licenses-summary.md` → “How to refresh”).
