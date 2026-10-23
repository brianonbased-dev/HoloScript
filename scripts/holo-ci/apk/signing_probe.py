#!/usr/bin/env python3
"""apk.signing_probe_understood  (HoloCI step E4)

BRIDGE: Python stdlib tooling under scripts/holo-ci/. This is NOT HoloScript-native;
HoloScript has no DEX/APK types yet (named native gap). Spec:
holo-specs/apk-rules-spec-20261021.md section 3 (Idea, 2026-10-21).

Observe only. This script never signs, re-signs, or strips signatures and never
writes to the APK. It reports which signer is present and compares the signer
certificate SHA-256 against house-signers.txt.

Limit, stated plainly: v0 checks WHO signed (certificate identity), not whether
the signature is cryptographically valid. stdlib has no RSA/EC verification.
If `apksigner` is on PATH it is run alongside as a labelled bridge and its
verdict is reported as evidence only (apksigner_bridge=...); it does not change
the v0 verdict. If absent it is skipped (apksigner_bridge=absent).

Output contract: exactly one stdout line
  RESULT apk.signing_probe_understood PASS|FAIL|UNKNOWN key=value ...
Exit: 0 PASS, 1 FAIL, 2 UNKNOWN. Anything that cannot be checked is UNKNOWN.
A plain-language sentence goes to stderr.

v1-only + targetSdk>=30 needs the manifest targetSdk. Decoding binary AXML is out
of scope for E4 (spec: "E4 signing (no AXML needed)"), so target SDK is supplied
with --target-sdk; when v1-only and it is not supplied the result is UNKNOWN.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import struct
import subprocess
import sys
import zipfile

RULE = "apk.signing_probe_understood"
MAGIC = b"APK Sig Block 42"
ID_V2 = 0x7109871A
ID_V3 = 0xF05368C0
ID_V31 = 0x1B93AD61  # v3.1 = rotation; lineage parsing is a named gap

# Walker limits (no shared Python walker exists in-repo yet; same limit set as spec).
MAX_APK_BYTES = 1 << 30
MAX_ENTRIES = 65535
MAX_TOTAL_UNCOMPRESSED = 4 << 30
MAX_RATIO = 200
MAX_SIG_FILE_BYTES = 1 << 20

V1_SIG_RE = re.compile(r"^META-INF/[^/]+\.(RSA|DSA|EC)$", re.IGNORECASE)
HEX64 = re.compile(r"^[0-9a-f]{64}$")


class Unknown(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


# ---------- house signers ----------
def load_house_signers(path: str) -> set[str]:
    if not os.path.isfile(path):
        raise Unknown("house_signers_missing")
    out: set[str] = set()
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            fp = line.replace(":", "").lower()
            if not HEX64.match(fp):
                # Only SHA-256 fingerprints belong here; never keys/certs.
                raise Unknown("house_signers_bad_line")
            out.add(fp)
    if not out:
        raise Unknown("house_signers_empty")
    return out


# ---------- zip walker ----------
def walk_zip(data: bytes, path: str) -> zipfile.ZipFile:
    try:
        zf = zipfile.ZipFile(path)
    except (zipfile.BadZipFile, OSError):
        raise Unknown("not_a_zip")
    infos = zf.infolist()
    if len(infos) > MAX_ENTRIES:
        raise Unknown("walker_too_many_entries")
    seen: set[str] = set()
    total = 0
    for i in infos:
        n = i.filename
        if n in seen:
            raise Unknown("walker_duplicate_name")
        seen.add(n)
        if n.startswith(("/", "\\")) or ".." in n.replace("\\", "/").split("/") or ":" in n:
            raise Unknown("walker_path_traversal")
        if n.lower().endswith(".apk"):
            raise Unknown("walker_nested_apk")
        total += i.file_size
        if total > MAX_TOTAL_UNCOMPRESSED:
            raise Unknown("walker_zip_bomb")
        if i.compress_size and i.file_size / i.compress_size > MAX_RATIO and i.file_size > (1 << 20):
            raise Unknown("walker_zip_bomb")
    return zf


def find_eocd(data: bytes) -> int:
    start = max(0, len(data) - (22 + 0xFFFF))
    idx = data.rfind(b"PK\x05\x06", start)
    if idx < 0 or idx + 22 > len(data):
        raise Unknown("no_eocd")
    return idx


# ---------- APK Signing Block ----------
def read_signing_block(data: bytes) -> dict[int, bytes] | None:
    eocd = find_eocd(data)
    cd_off = struct.unpack_from("<I", data, eocd + 16)[0]
    if cd_off > eocd:
        raise Unknown("bad_cd_offset")
    if cd_off < 32 or data[cd_off - 16:cd_off] != MAGIC:
        return None  # no signing block
    size_footer = struct.unpack_from("<Q", data, cd_off - 24)[0]
    start = cd_off - size_footer - 8
    if size_footer < 24 or start < 0:
        raise Unknown("malformed_signing_block")
    if struct.unpack_from("<Q", data, start)[0] != size_footer:
        raise Unknown("malformed_signing_block")
    pairs: dict[int, bytes] = {}
    p, end = start + 8, cd_off - 24
    while p < end:
        if p + 12 > end:
            raise Unknown("malformed_signing_block")
        ln = struct.unpack_from("<Q", data, p)[0]
        if ln < 4 or p + 8 + ln > end:
            raise Unknown("malformed_signing_block")
        pid = struct.unpack_from("<I", data, p + 8)[0]
        pairs[pid] = data[p + 12:p + 8 + ln]
        p += 8 + ln
    if p != end:
        raise Unknown("malformed_signing_block")
    return pairs


def _lp(buf: bytes, p: int) -> tuple[bytes, int]:
    if p + 4 > len(buf):
        raise Unknown("malformed_signing_block")
    n = struct.unpack_from("<I", buf, p)[0]
    if p + 4 + n > len(buf):
        raise Unknown("malformed_signing_block")
    return buf[p + 4:p + 4 + n], p + 4 + n


def _seq(buf: bytes) -> list[bytes]:
    items, p = [], 0
    while p < len(buf):
        item, p = _lp(buf, p)
        items.append(item)
    return items


def scheme_signer_certs(value: bytes) -> list[bytes]:
    """v2/v3 value -> first certificate DER of each signer."""
    signers_blob, rest = _lp(value, 0)
    if rest != len(value):
        raise Unknown("malformed_signing_block")
    certs = []
    for signer in _seq(signers_blob):
        signed_data, _ = _lp(signer, 0)
        _digests, p = _lp(signed_data, 0)
        certs_blob, _ = _lp(signed_data, p)
        cl = _seq(certs_blob)
        if not cl:
            raise Unknown("malformed_signing_block")
        certs.append(cl[0])
    if not certs:
        raise Unknown("malformed_signing_block")
    return certs


# ---------- v1 (PKCS#7 SignedData) minimal DER ----------
def _der(buf: bytes, p: int) -> tuple[int, int, int]:
    """returns (tag, content_start, content_end)"""
    if p + 2 > len(buf):
        raise Unknown("malformed_v1_signature")
    tag = buf[p]
    ln = buf[p + 1]
    p += 2
    if ln & 0x80:
        k = ln & 0x7F
        if k == 0 or k > 4 or p + k > len(buf):
            raise Unknown("malformed_v1_signature")
        ln = int.from_bytes(buf[p:p + k], "big")
        p += k
    if p + ln > len(buf):
        raise Unknown("malformed_v1_signature")
    return tag, p, p + ln


def v1_certs(sig: bytes) -> list[bytes]:
    t, s, e = _der(sig, 0)  # ContentInfo SEQUENCE
    if t != 0x30:
        raise Unknown("malformed_v1_signature")
    t, s2, e2 = _der(sig, s)  # contentType OID
    if t != 0x06:
        raise Unknown("malformed_v1_signature")
    t, s3, e3 = _der(sig, e2)  # [0] EXPLICIT
    if t != 0xA0:
        raise Unknown("malformed_v1_signature")
    t, sd, sde = _der(sig, s3)  # SignedData SEQUENCE
    if t != 0x30:
        raise Unknown("malformed_v1_signature")
    p = sd
    certs: list[bytes] = []
    while p < sde:
        t, cs, ce = _der(sig, p)
        if t == 0xA0:  # certificates [0] IMPLICIT SET OF Certificate
            q = cs
            while q < ce:
                t2, a, b = _der(sig, q)
                certs.append(sig[q:b])
                q = b
        p = ce
    return certs


# ---------- apksigner bridge (evidence only) ----------
def apksigner_bridge(path: str, enabled: bool) -> str:
    if not enabled:
        return "skipped"
    exe = shutil.which("apksigner")
    if not exe:
        return "absent"
    try:
        r = subprocess.run([exe, "verify", path], capture_output=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return "error"
    return "pass" if r.returncode == 0 else "fail"


# ---------- probe ----------
def probe(path: str, signers_path: str, target_sdk: int | None, use_bridge: bool):
    ev: dict[str, str] = {"apk": os.path.basename(path)}
    ev["target_sdk"] = str(target_sdk) if target_sdk is not None else "unknown"

    def done(verdict, reason, sentence):
        ev["reason"] = reason
        ev["apksigner_bridge"] = apksigner_bridge(path, use_bridge and verdict != "UNKNOWN_EARLY")
        return verdict, ev, sentence

    try:
        if not os.path.isfile(path):
            raise Unknown("apk_missing")
        if os.path.getsize(path) > MAX_APK_BYTES:
            raise Unknown("walker_too_large")
        with open(path, "rb") as fh:
            data = fh.read()
        zf = walk_zip(data, path)
        house = load_house_signers(signers_path)
        pairs = read_signing_block(data) or {}

        v1_files = [i for i in zf.infolist() if V1_SIG_RE.match(i.filename)]
        v1_fps: list[str] = []
        if len(v1_files) > 1:
            raise Unknown("multiple_signers")
        if v1_files:
            if v1_files[0].file_size > MAX_SIG_FILE_BYTES:
                raise Unknown("malformed_v1_signature")
            certs = v1_certs(zf.read(v1_files[0]))
            if len(certs) != 1:
                raise Unknown("multiple_signers" if certs else "malformed_v1_signature")
            v1_fps = [hashlib.sha256(certs[0]).hexdigest()]

        if ID_V31 in pairs:
            raise Unknown("multiple_signers")  # rotation lineage: named gap
        scheme_fps: dict[str, str] = {}
        for name, pid in (("v2", ID_V2), ("v3", ID_V3)):
            if pid in pairs:
                certs = scheme_signer_certs(pairs[pid])
                if len(certs) != 1:
                    raise Unknown("multiple_signers")
                scheme_fps[name] = hashlib.sha256(certs[0]).hexdigest()
        if len(set(scheme_fps.values())) > 1:
            raise Unknown("multiple_signers")  # v2 != v3 implies rotation

        schemes = (["v1"] if v1_fps else []) + sorted(scheme_fps)
        ev["scheme"] = ",".join(schemes) if schemes else "none"

        if not scheme_fps and not v1_fps:
            if os.path.isfile(path + ".idsig"):
                raise Unknown("v4_only")
            ev["signer_sha256"] = "none"
            return done("FAIL", "unsigned", "Release blocked: this build is not signed.")

        if not scheme_fps:  # v1 only
            ev["signer_sha256"] = v1_fps[0]
            if target_sdk is None:
                raise Unknown("v1_only_target_sdk_unknown")
            if target_sdk >= 30:
                return done("FAIL", "v1_only_target_sdk_ge_30",
                            "Release blocked: this build is signed only with the old v1 scheme, which Android 11+ targets reject.")
            raise Unknown("v1_only_below_sdk30")  # spec defines no PASS for v1-only

        fp = next(iter(scheme_fps.values()))
        ev["signer_sha256"] = fp
        if v1_fps and v1_fps[0] != fp:
            return done("FAIL", "v1_v2v3_signer_mismatch",
                        "Release blocked: the old and new signatures name different signers.")
        if fp not in house:
            return done("FAIL", "signer_not_in_house_signers",
                        "Release blocked: this build was signed by a key that isn't ours.")
        return done("PASS", "house_signer",
                    "This build is signed by a house key (identity only; signature validity not checked by v0).")
    except Unknown as u:
        ev.setdefault("scheme", "unknown")
        ev.setdefault("signer_sha256", "unknown")
        ev["reason"] = u.reason
        ev["apksigner_bridge"] = "skipped"
        return "UNKNOWN", ev, f"Could not check signing ({u.reason}); treated as not proven."


def main(argv=None) -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("apk")
    ap.add_argument("--house-signers", default=os.path.join(here, "house-signers.txt"))
    ap.add_argument("--target-sdk", type=int, default=None)
    ap.add_argument("--no-apksigner", action="store_true", help="skip the apksigner bridge")
    a = ap.parse_args(argv)
    verdict, ev, sentence = probe(a.apk, a.house_signers, a.target_sdk, not a.no_apksigner)
    kv = " ".join(f"{k}={v}" for k, v in ev.items())
    print(f"RESULT {RULE} {verdict} {kv}")
    print(sentence, file=sys.stderr)
    return {"PASS": 0, "FAIL": 1}.get(verdict, 2)


if __name__ == "__main__":
    sys.exit(main())