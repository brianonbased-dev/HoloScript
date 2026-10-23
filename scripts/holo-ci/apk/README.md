# apk.signing_probe_understood (HoloCI E4) — BRIDGE

**BRIDGE, not HoloScript-native.** Python stdlib under `scripts/holo-ci/`. HoloScript has no DEX/APK types yet.
Spec: Idea, `apk-rules-spec-20261021.md` section 3.

Observe only: it never signs, re-signs or strips. It prints one line, `RESULT apk.signing_probe_understood PASS|FAIL|UNKNOWN key=value...`, and exits 0/1/2. Anything it can't check comes back UNKNOWN.

```
python scripts/holo-ci/apk/signing_probe.py app-release.apk [--target-sdk 34] [--house-signers path] [--no-apksigner]
```

| Verdict | When |
|---|---|
| PASS | A v2/v3 block is present, the signer cert SHA-256 is in `house-signers.txt`, and any v1 signer matches it |
| FAIL | Unsigned; v1-only with targetSdk >= 30; signer not in house list; v1 signer differs from v2/v3 |
| UNKNOWN | Malformed signing block or v1 PKCS#7; v4-only (`<apk>.idsig` present, nothing else); multiple signers or rotation (v3.1, or v2 != v3); house list missing, empty or holding a non-fingerprint line; walker limits hit (nested APK, path traversal, duplicate names, zip bomb); v1-only without `--target-sdk` |

**Limit:** v0 checks who signed, not whether the signature is valid (stdlib has no RSA/EC). If `apksigner` is on PATH, `apksigner verify` runs alongside as a labelled bridge and is reported as `apksigner_bridge=pass|fail|error`. It is evidence only and doesn't change the verdict. If it isn't on PATH you get `absent`.

`house-signers.txt` holds fingerprints only and is a placeholder that Release or Hardware fills in. Never put keys in it.

Tests use synthetic bytes only (no real APKs or keys): `python -m unittest scripts/holo-ci/apk/test_signing_probe.py`

Wiring: Grok Build adds it to HoloCI as non-blocking, following the E1 pattern.