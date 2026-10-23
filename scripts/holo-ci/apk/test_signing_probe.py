"""Unit tests for apk/signing_probe.py (BRIDGE). Synthetic byte fixtures only:
no real APKs, no real keys. Certificates are opaque fake DER blobs."""
import hashlib, io, os, struct, sys, tempfile, unittest, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import signing_probe as sp  # noqa: E402

HOUSE = b"\x30\x05FAKEH"   # fake "test key" certificate, test-only
FOREIGN = b"\x30\x05FAKEF"
HOUSE_FP = hashlib.sha256(HOUSE).hexdigest()


def lp(b): return struct.pack("<I", len(b)) + b
def seq(*items): return b"".join(lp(i) for i in items)


def scheme_value(*certs):
    signers = []
    for c in certs:
        signed_data = lp(b"") + lp(seq(c)) + b"\x00" * 8
        signers.append(lp(signed_data) + lp(b"") + lp(b""))
    return lp(seq(*[s for s in signers]))


def signing_block(pairs):
    body = b"".join(struct.pack("<QI", len(v) + 4, pid) + v for pid, v in pairs)
    size = len(body) + 24
    return struct.pack("<Q", size) + body + struct.pack("<Q", size) + sp.MAGIC


def der(tag, content):
    n = len(content)
    ln = bytes([n]) if n < 128 else bytes([0x82]) + n.to_bytes(2, "big")
    return bytes([tag]) + ln + content


def pkcs7(*certs):
    sd = der(0x02, b"\x01") + der(0x31, b"") + der(0x30, der(0x06, b"\x2a")) + der(0xA0, b"".join(certs)) + der(0x31, b"")
    return der(0x30, der(0x06, b"\x2a\x86\x48") + der(0xA0, der(0x30, sd)))


def apk(block=None, v1=None, extra=()):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("AndroidManifest.xml", b"\x03\x00")
        z.writestr("classes.dex", b"dex\n035\x00")
        if v1 is not None:
            z.writestr("META-INF/MANIFEST.MF", b"Manifest-Version: 1.0\r\n")
            z.writestr("META-INF/CERT.SF", b"Signature-Version: 1.0\r\n")
            z.writestr("META-INF/CERT.RSA", v1)
        for n, d in extra:
            z.writestr(n, d)
    data = buf.getvalue()
    if block is None:
        return data
    eocd = data.rfind(b"PK\x05\x06")
    cd_off = struct.unpack_from("<I", data, eocd + 16)[0]
    new = data[:cd_off] + block + data[cd_off:]
    e2 = eocd + len(block)
    return new[:e2 + 16] + struct.pack("<I", cd_off + len(block)) + new[e2 + 20:]


class Probe(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.hs = os.path.join(self.d, "house-signers.txt")
        with open(self.hs, "w") as f:
            f.write("# test-only house list\n" + ":".join(HOUSE_FP[i:i+2] for i in range(0, 64, 2)) + "\n")

    def run_on(self, data, sdk=None, hs=None, name="t.apk"):
        p = os.path.join(self.d, name)
        with open(p, "wb") as f:
            f.write(data)
        v, ev, _ = sp.probe(p, hs or self.hs, sdk, False)
        return v, ev

    def test_signed_house_v2_pass(self):
        v, ev = self.run_on(apk(signing_block([(sp.ID_V2, scheme_value(HOUSE))])))
        self.assertEqual((v, ev["scheme"], ev["signer_sha256"]), ("PASS", "v2", HOUSE_FP))

    def test_signed_house_v1_v2_v3_pass(self):
        b = signing_block([(sp.ID_V2, scheme_value(HOUSE)), (sp.ID_V3, scheme_value(HOUSE))])
        v, ev = self.run_on(apk(b, v1=pkcs7(HOUSE)))
        self.assertEqual((v, ev["scheme"]), ("PASS", "v1,v2,v3"))

    def test_unsigned_fail(self):
        self.assertEqual(self.run_on(apk())[0], "FAIL")

    def test_v1_only_sdk30_fail(self):
        v, ev = self.run_on(apk(v1=pkcs7(HOUSE)), sdk=30)
        self.assertEqual((v, ev["reason"]), ("FAIL", "v1_only_target_sdk_ge_30"))

    def test_v1_only_sdk_unknown(self):
        self.assertEqual(self.run_on(apk(v1=pkcs7(HOUSE)))[0], "UNKNOWN")

    def test_foreign_signer_fail(self):
        v, ev = self.run_on(apk(signing_block([(sp.ID_V2, scheme_value(FOREIGN))])))
        self.assertEqual((v, ev["reason"]), ("FAIL", "signer_not_in_house_signers"))

    def test_mismatch_v1_v2_fail(self):
        v, ev = self.run_on(apk(signing_block([(sp.ID_V2, scheme_value(HOUSE))]), v1=pkcs7(FOREIGN)))
        self.assertEqual((v, ev["reason"]), ("FAIL", "v1_v2v3_signer_mismatch"))

    def test_bad_sig_block_unknown(self):
        b = bytearray(signing_block([(sp.ID_V2, scheme_value(HOUSE))]))
        b[0] ^= 0xFF  # corrupt leading size
        v, ev = self.run_on(apk(bytes(b)))
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "malformed_signing_block"))

    def test_truncated_scheme_value_unknown(self):
        v, _ = self.run_on(apk(signing_block([(sp.ID_V2, b"\xff\x00\x00\x00")])))
        self.assertEqual(v, "UNKNOWN")

    def test_v4_only_unknown(self):
        p = os.path.join(self.d, "v4.apk")
        with open(p + ".idsig", "wb") as f:
            f.write(b"idsig")
        v, ev = self.run_on(apk(), name="v4.apk")
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "v4_only"))

    def test_multiple_signers_unknown(self):
        v, ev = self.run_on(apk(signing_block([(sp.ID_V2, scheme_value(HOUSE, FOREIGN))])))
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "multiple_signers"))

    def test_rotation_v31_unknown(self):
        b = signing_block([(sp.ID_V3, scheme_value(HOUSE)), (sp.ID_V31, scheme_value(FOREIGN))])
        self.assertEqual(self.run_on(apk(b))[0], "UNKNOWN")

    def test_empty_house_list_unknown(self):
        e = os.path.join(self.d, "empty.txt")
        open(e, "w").write("# placeholder\n")
        v, ev = self.run_on(apk(signing_block([(sp.ID_V2, scheme_value(HOUSE))])), hs=e)
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "house_signers_empty"))

    def test_key_material_in_house_list_unknown(self):
        e = os.path.join(self.d, "bad.txt")
        open(e, "w").write("-----BEGIN " + "PRIV" + "ATE KEY-----\n")  # split so secret scanners do not trip
        v, ev = self.run_on(apk(), hs=e)
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "house_signers_bad_line"))

    def test_nested_apk_unknown(self):
        v, ev = self.run_on(apk(extra=[("assets/inner.apk", b"PK")]))
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "walker_nested_apk"))

    def test_path_traversal_unknown(self):
        v, ev = self.run_on(apk(extra=[("../evil", b"x")]))
        self.assertEqual((v, ev["reason"]), ("UNKNOWN", "walker_path_traversal"))

    def test_not_zip_unknown(self):
        self.assertEqual(self.run_on(b"not a zip")[0], "UNKNOWN")

    def test_template_has_no_fingerprints(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with self.assertRaises(sp.Unknown):
            sp.load_house_signers(os.path.join(here, "house-signers.txt"))

    def test_observe_only_apk_unchanged(self):
        data = apk(signing_block([(sp.ID_V2, scheme_value(HOUSE))]))
        p = os.path.join(self.d, "ro.apk"); open(p, "wb").write(data)
        sp.probe(p, self.hs, None, False)
        self.assertEqual(open(p, "rb").read(), data)

    def test_cli_exit_codes(self):
        p = os.path.join(self.d, "c.apk")
        open(p, "wb").write(apk(signing_block([(sp.ID_V2, scheme_value(HOUSE))])))
        self.assertEqual(sp.main([p, "--house-signers", self.hs, "--no-apksigner"]), 0)
        open(p, "wb").write(apk())
        self.assertEqual(sp.main([p, "--house-signers", self.hs, "--no-apksigner"]), 1)
        open(p, "wb").write(b"junk")
        self.assertEqual(sp.main([p, "--house-signers", self.hs, "--no-apksigner"]), 2)


if __name__ == "__main__":
    unittest.main()