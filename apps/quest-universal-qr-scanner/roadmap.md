# HoloQR product roadmap

> **Status:** Active
>
> **Refreshed:** 2026-07-26
>
> **Current release:** HoloQR `1.0.2` was rejected in Meta Horizon Store review
> on 2026-09-02. The resubmit candidate is `1.0.3`, authored from this HoloScript
> source path.

HoloQR is the first paid HoloScript-built product. The launch price is USD $3. Revenue matters,
but it does not weaken the product invariant: a HoloQR version does not ship unless HoloScript
materially authors its behavior and builds the native app.

This product is a release proof for HoloScript as a general-purpose systems programming language:
the language owns product behavior and policy, while its compiler emits the external Quest platform
artifact.

## Product invariant

The source of truth is [`scanner.holo`](./scanner.holo),
[`scanner-lifecycle.hsplus`](./scanner-lifecycle.hsplus), and the compositions under
[`worlds/`](./worlds). The Quest project under [`android-mr/`](./android-mr) is compiler output
plus bounded platform adapters.

```text
HoloScript source
  -> HoloCompositionParser + HSI-IR + QuestCompiler
  -> generated Quest project
  -> independent byte-match gate
  -> signed APK
  -> exact-build Quest validation
  -> Meta review
```

Camera2, ZXing, Quest SDK, clipboard, and browser intents remain platform adapter boundaries. They
may implement device I/O, but they may not become a second source for product policy, routing,
permissions, consent, storage, trust, presentation, or release metadata. A feature that requires
hidden hand-authored native behavior is a language/compiler gap and is not ready to ship.

## Current baseline

| Surface            | What is true now                                                                                                 | Evidence                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Scan and classify  | QR frames are decoded on-device and classified by the ordered `content_types` table in HoloScript.               | [`scanner.holo`](./scanner.holo), [`QuestCompiler.mr.test.ts`](../../packages/core/src/compiler/__tests__/QuestCompiler.mr.test.ts) |
| User control       | Opening, copying, bookmarking, and world entry require an explicit user action; unknown routing fails closed.    | [`scanner-lifecycle.hsplus`](./scanner-lifecycle.hsplus), [`scanner.holo`](./scanner.holo)                                          |
| Private state      | Saved links stay in device-private storage; diagnostic receipts omit raw payloads and form a bounded HMAC chain. | [`scanner.holo`](./scanner.holo), [`PRIVACY.md`](./PRIVACY.md)                                                                      |
| World entry        | Bundled worlds are compiler-registered. Remote worlds require an Ed25519 signature and explicit consent.         | [`scanner.holo`](./scanner.holo), [`worlds/`](./worlds)                                                                             |
| Release provenance | Generation and an independent byte-match check run before signing or Gradle packaging.                           | [`README.md`](./README.md), [`RELEASE.md`](./RELEASE.md)                                                                            |
| Distribution       | `1.0.2` was rejected; `1.0.3` is the review-repair candidate.                                                    | Meta submission `1114952735042547`; privacy/screenshots/crash repairs in this version                                               |

## Version sequence

Versions advance when their exit gate is proven. Dates are deliberately absent: review feedback,
headset evidence, and language readiness decide shipment.

| Version         | Product outcome                                                                                                                                                      | HoloScript and compiler work                                                                                                                                                                              | Exit gate                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0.x`         | Review closure and field stability. Fix only review, crash, camera, controller, content-safety, or compatibility defects needed for a dependable paid utility.       | Keep every patch source-authored. Any native correction must be represented in a trait, lifecycle rule, compiler emission, or declared platform adapter before release.                                   | Meta review feedback is closed; the exact candidate passes the complete release gate below without adding unnecessary permissions.                                               |
| `1.1`           | Scan confidence and accessibility. Make acquisition state, aiming guidance, duplicate handling, result state, and recovery understandable without guessing.          | Extend `@qr_decode`, `@spatial_panel`, and `ScannerLifecycle` so scan regions, confidence policy, presentation states, and accessible cues remain compiler-visible rather than hand-written Kotlin.       | Decoder fixtures, compiler emission tests, and Quest headset testing prove the new states; privacy and permission posture do not regress.                                        |
| `1.2`           | Private library and user-controlled handoff. Add optional local history, stronger organization, bulk deletion, and export/share of only the item the person chooses. | Extend `@local_collection` with typed records, retention, deletion, and explicit export policy. Route every outward handoff through consent-bearing HoloScript state.                                     | Default behavior remains local-only; retention and deletion are tested; privacy/store declarations match the built behavior; no background transmission exists.                  |
| `1.3`           | Trusted HoloScript portals. Make signed remote world links usable with a clear preview, signer identity, expiry/revocation handling, and an intelligible deny state. | Complete the `@world_portal` trust contract: compiler-owned key sets or trust roots, signed manifest verification, origin constraints, preview data, and key rotation. Keep entry behind `@consent_gate`. | Unsigned, expired, revoked, unknown-key, and malformed worlds fail closed; a signed remote world passes an end-to-end Quest test without bypassing the compiler.                 |
| `2.0` candidate | HoloQR as a spatial invocation surface for HoloScript apps, worlds, and narrowly scoped agent actions—not just decoded text.                                         | Define a signed, capability-scoped HoloQR payload contract in HoloScript, with explicit effects, identity, consent, replay protection, and portable receipts.                                             | This milestone stays uncommitted until the earlier versions are in use and the language can express and enforce the entire security boundary without opaque native control flow. |

## Commercial and feedback plan

- Launch at USD $3 after Meta approval and release scheduling.
- Treat HoloQR as the first revenue proof for the language: sales are evidence that a
  HoloScript-built product solved a concrete problem, not permission to bypass source provenance.
- Prioritize updates from Meta review findings, store reviews, support reports, refund reasons, and
  user-initiated diagnostic exports. The app remains free of developer analytics by default.
- Do not add ads, accounts, subscriptions, cloud sync, or background collection merely to create
  engagement metrics. Each would require a separate product decision, new language-visible consent
  and policy, a privacy review, and new store declarations.
- A future price change is an explicit commercial decision. It is not coupled automatically to a
  version number.

## Release gate for every version

Every item is required unless the item is explicitly inapplicable and the release receipt records
why.

1. The version and all user-visible behavior are authored in `.holo`, `.hsplus`, or `.hs`.
2. Parser, HSI-IR, and Quest compiler tests cover the new behavior and its fail-closed cases.
3. `pnpm check:holoqr-born-from-source` regenerates the native project and byte-matches the
   compiler-owned reference.
4. `pnpm holoqr:build-release` produces the signed release APK through the gated path.
5. The packaged manifest contains only requested permissions and supported device declarations.
6. Signature, architecture, package identity, version, and release artifact digest are recorded.
7. The exact release-channel candidate installs and runs on a supported Quest headset.
8. Camera permission, scanning, each changed action, dismissal/recovery, and cold launch are tested
   on hardware with no fatal Java or native crash.
9. Meta's applicable automated security, malware, compatibility, and policy checks are green.
10. [`STORE_LISTING.md`](./STORE_LISTING.md), [`PRIVACY.md`](./PRIVACY.md), and
    [`RELEASE.md`](./RELEASE.md) describe the candidate that was actually built.

## Roadmap discipline

- **Shipped** means the release gate passed for the exact store candidate.
- **Submitted** means Meta has the candidate; it does not mean approved or released.
- **Planned** means the product outcome is accepted but its implementation is not yet a capability
  claim.
- New native glue is recorded as a language/compiler gap and cannot silently become product
  authorship.
- If a version's value does not survive user evidence, skip or reshape it. Version labels are
  sequencing tools, not promises.
