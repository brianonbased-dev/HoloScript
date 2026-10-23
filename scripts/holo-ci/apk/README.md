# apk.signing_probe_understood (HoloCI E4) — BRIDGE

**BRIDGE, not HoloScript-native.** Python stdlib under `scripts/holo-ci/`. HoloScript has no DEX/APK types yet.
Spec: Idea, `apk-rules-spec-20261021.md` section 3.

Observe only: it never signs, re-signs or strips. It prints one line, `RESULT apk.signing_probe_understood PASS|FAIL|UNKNOWN key=value...`, and exits 0/1/2. Anything it can't check comes back UNKNOWN.

```
python scripts/holo-ci/apk/signing_probe.py app-release.apk [--target-sdk 34] [--house-signers path] [--no-apksigner]
```

| Verdict | When |
|---|---|
| PASS | A v2/v3 block is present, the signer cert SHA-256 is in `house-signers.txt`, any v1 signer matches it, **and `apksigner verify` (bridge) passes** |
| FAIL | Unsigned; v1-only with targetSdk >= 30; signer not in house list (any scheme, any SDK); v1 signer differs from v2/v3; apksigner bridge fails |
| UNKNOWN | House signer but apksigner absent/skipped/errored (`signature_unverified`); malformed signing block (incl. duplicate pair IDs), bad EOCD/central-directory offset, zip64 or v1 PKCS#7; v4-only (`<apk>.idsig` present, nothing else); multiple signers or rotation (v3.1, or v2 != v3); house list missing, empty or holding a non-fingerprint line; walker limits hit (nested APK, path traversal, duplicate names, zip bomb); v1-only without `--target-sdk` |

**Limit:** the stdlib part checks who signed, not whether the signature is valid (stdlib has no RSA/EC). **v0 PASS therefore needs the `apksigner verify` bridge to pass.** Bridge fail gives FAIL; bridge absent, skipped (`--no-apksigner`) or errored gives UNKNOWN `signature_unverified`. A forged signature over a house cert can never PASS.

`house-signers.txt` holds fingerprints only and is a placeholder that Release or Hardware fills in. Never put keys in it.

Tests use synthetic bytes only (no real APKs or keys): `python -m unittest discover -s scripts/holo-ci/apk -p "test_*.py"`

Wiring: Grok Build adds it to HoloCI as non-blocking, following the E1 pattern.