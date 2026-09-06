# Admit storefront (HoloGate / HoloQR)

**Status:** thin local window for the **admit** store, kept next to the
language compilers because Quest compile and `scanner.holo` live in
HoloScript. The worlds store is HoloLand. The vehicle is `.ai-ecosystem`.

Mall: `C:/holo-dev/ai-ecosystem/docs/handbooks/holon-storefront.md`.

---

## What this store is for

Walk up to a **physical mark** — a unit, a door, a poster — and enter the
world or link that belongs to it. Keys, repo custody, and CI are the same
family (identify → authorize → scope → admit → log). This is **not**
“scan a VR code” and **not** `hs_scan_project`.

House special: HoloQR on Quest. Source is
`apps/quest-universal-qr-scanner/scanner.holo` → `compile_to_quest` →
golden-diff → signed APK. Cameras stay on device. Ordinary URLs open in
Quest Browser. World links enter compiler-generated scenes.

---

## Greeter

1. Building the scanner app, or walking up to a mark with a headset?
2. Ordinary web link, or a HoloScript world link?
3. Already have a signed APK, or still in `.holo`?

Send inhabit/create to HoloLand. Send language/compile bugs to the
language storefront. Send “scan my git tree” to Absorb, not here.

---

## Jobs

| Purpose | People walk out with | Agents fetch | Honest status (2026-09-06) |
| --- | --- | --- | --- |
| Admit via printed mark | Headset opens **this** world or URL | `compile_to_quest`, `get_tool_manifest` pattern `qr` | App is HoloScript-authored. Store candidate `1.0.4` still **changes-requested**. Paint desk still maps “scan” to repo-scan. |
| Compile the scanner from source | APK that traces to current `.holo` | Release invariant in the HoloQR README | Shipping path is gated. `gradlew` alone is not a ship. |
| Keys / custody | A lease, not a pasted secret | HoloKey / secrets tools | Gate family. Not the stranger language door. |

Do not put this aisle on the HoloScript GitHub README until the language
[`github-v1-gate.md`](./github-v1-gate.md) is green **and** this meal can
be stated with current store status, not a gadget slogan.
