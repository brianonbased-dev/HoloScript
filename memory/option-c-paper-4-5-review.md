# Option C applicability — paper-4 (Sandbox) & paper-5 (GraphRAG)

**Review date:** 2026-04-21  
**Sources:** `~/.ai-ecosystem/research/paper-4-sandbox-usenix.tex`, `paper-5-graphrag-icse.tex` (local research copies).

## Executive summary

| Paper | Inherit full Option C block from paper-0c / capstone? | Recommended action |
|-------|------------------------------------------------------|--------------------|
| **Paper-4** | **No.** Threat-model voice is distinct; hash story is already native (FNV-1a + limitations + SHA-256 future work). | **At most one sentence** in Limitations or Future Work, in paper-4’s own wording, noting that a HoloScript deployment may enable SHA-256 for geometry/trace digests when the adversary can influence mesh content—without importing the `useCryptographicHash` API name unless the venue wants implementation tie-in. |
| **Paper-5** | **Partial alignment only.** Evidence hashing is explicitly non-crypto (staleness/accidental drift); SHA-256 is already mentioned for regulated contexts. | **Optional** single sentence in §evidence hashing: cross-link that the same *class* of upgrade (FNV default → SHA-256 under policy) exists at the simulation-contract layer in other HoloScript papers—**not** a full Option C paste. |

## Paper-4 (Sandbox)

- **Already covered:** `\fnvhash{}` throughout; **“Limitations of FNV-1a”** (non-cryptographic; SHA-256 replacement at higher cost); future work on cryptographic attestation / SHA-256.
- **Why not full Option C inheritance:** Paper-4’s contribution is **sandbox adversary taxonomy**, WASM/capability isolation, and simulation-contract semantics. Dropping in the Option C paragraph from CAEL/capstone would **flatten** that voice and suggest the paper is “about” the HoloScript flag rather than about sandbox security.

## Paper-5 (GraphRAG)

- **Already covered:** FNV-1a for `evidenceHash` with explicit **threat model = staleness, not malicious collision**; prose allows **SHA-256** for regulated / audit contexts; graph snapshot IDs use FNV with defined fallback behavior.
- **Why not full Option C inheritance:** GraphRAG evidence is **not** the same object as the CAEL per-step state digest; forcing `useCryptographicHash` would confuse readers. A **light** cross-reference to “SHA-256 upgrade path consistent with contract-layer hashing options in the HoloScript platform” is enough for cross-paper consistency if reviewers ask.

## Closure

**Founder-gated judgment:** Defer **verbatim** Option C inheritance; allow **≤1 sentence each** if camera-ready pass requires cross-paper consistency—written in the paper’s native terminology.
