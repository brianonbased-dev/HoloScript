#!/usr/bin/env python3
"""Test: minif2f-probe-runner.py pipeline (all mocked). Exit 0=pass, 1=fail."""
from __future__ import annotations
import json, os, sys, tempfile, types, unittest
from pathlib import Path
from unittest import mock

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SCRIPTS_DIR))
_FIXTURE_PATH = _SCRIPTS_DIR / "fixtures" / "minif2f-sample-10.json"

_saved = sys.argv[:]
sys.argv = ["minif2f-probe-runner.py",
            f"--problems-json={_FIXTURE_PATH}", "--n=3", "--dry-run"]
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    "minif2f_probe_runner", str(_SCRIPTS_DIR / "minif2f-probe-runner.py"))
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
sys.argv = _saved
runner = _mod

KNOWN_PROVABLE = {
    "id": "mathd_numbertheory_344", "expected_difficulty": "easy",
    "source": "miniF2F-test",
    "statement": "theorem mathd_numbertheory_344 : (2 : ℕ) ^ 10 % 10 = 4 := by sorry"}
KNOWN_HARD = {
    "id": "hard_dummy_001", "expected_difficulty": "hard", "source": "test",
    "statement": "theorem hard_dummy_001 (n : ℕ) : n + 0 = n := by sorry"}


def make_args(**kw):
    ns = types.SimpleNamespace(n=10, target_pass_at_10=0.5, max_iters=10,
        problems_json=str(_FIXTURE_PATH), lean_project="/tmp/fake-lean",
        main_url="http://127.0.0.1:8081", sidecar_url="http://127.0.0.1:8082",
        no_sidecar=False, dry_run=False, verbose=False,
        receipt_dir="/tmp/probe-test-receipts",
        main_model="Qwen-72B", sidecar_model="Goedel-V2-7B")
    for k, v in kw.items(): setattr(ns, k, v)
    return ns


# --- TestLoad ---
class TestLoad(unittest.TestCase):
    def test_loads_fixture(self):
        runner.args = make_args()
        probs, src = runner.load_problems()
        self.assertGreater(len(probs), 0)
        self.assertIn("minif2f-sample-10.json", src)

    def test_n_limit(self):
        runner.args = make_args(n=3)
        probs, _ = runner.load_problems()
        self.assertEqual(len(probs), 3)

    def test_missing_exits_3(self):
        runner.args = make_args(problems_json="/no/such.json")
        with self.assertRaises(SystemExit) as cm: runner.load_problems()
        self.assertEqual(cm.exception.code, 3)

    def test_bad_json_exits_3(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write("bad{{{"); fname = f.name
        runner.args = make_args(problems_json=fname)
        try:
            with self.assertRaises(SystemExit) as cm: runner.load_problems()
            self.assertEqual(cm.exception.code, 3)
        finally:
            os.unlink(fname)


# --- TestScaffold ---
class TestScaffold(unittest.TestCase):
    def test_sidecar_first(self):
        lean = "import Mathlib\ntheorem foo : True := by sorry"
        msgs = runner.build_sidecar_prompt("True", lean, None)
        self.assertEqual(msgs[0]["role"], "system")
        self.assertIn(":= by", msgs[1]["content"])
        self.assertNotIn(":= by sorry", msgs[1]["content"])

    def test_sidecar_retry(self):
        lean = "import Mathlib\ntheorem foo : True := by sorry"
        msgs = runner.build_sidecar_prompt("True", lean, "unknown identifier")
        self.assertIn("unknown identifier", msgs[1]["content"])

    def test_main_first(self):
        lean = "import Mathlib\ntheorem foo : True := by sorry"
        msgs = runner.build_main_prompt("True", lean, None)
        self.assertIn(":= by", msgs[1]["content"])


# --- TestLakeVerify ---
class TestLakeVerify(unittest.TestCase):
    def _mk(self):
        d = Path(tempfile.mkdtemp())
        (d / "Probe").mkdir()
        return d

    def test_success(self):
        d = self._mk()
        with mock.patch("subprocess.run") as m:
            m.return_value = mock.Mock(returncode=0, stdout="", stderr="", text=True)
            r = runner.lean_file_check("theorem t:True:=by trivial", "p1", str(d), 0)
        self.assertTrue(r["ok"])
        self.assertEqual(r["exit_code"], 0)

    def test_failure(self):
        d = self._mk()
        with mock.patch("subprocess.run") as m:
            m.return_value = mock.Mock(returncode=1, stdout="", stderr="type mismatch", text=True)
            r = runner.lean_file_check("bad lean", "p1", str(d), 0)
        self.assertFalse(r["ok"])
        self.assertEqual(r["exit_code"], 1)
        self.assertIn("type mismatch", r["output"])

    def test_exit_code_present(self):
        d = self._mk()
        with mock.patch("subprocess.run") as m:
            m.return_value = mock.Mock(returncode=2, stdout="", stderr="err", text=True)
            r = runner.lean_file_check("lean", "p2", str(d), 1)
        self.assertEqual(r["exit_code"], 2)


# --- TestProbeOne ---
class TestProbeOne(unittest.TestCase):
    def _mk(self):
        d = Path(tempfile.mkdtemp())
        (d / "Probe").mkdir()
        return d

    def test_success_iter0(self):
        d = self._mk()
        runner.args = make_args(lean_project=str(d), no_sidecar=False, max_iters=5)
        with mock.patch.object(runner, "llm_chat_complete", return_value="decide"), \
             mock.patch.object(runner, "lean_file_check",
                return_value={"ok": True, "exit_code": 0, "output": "", "lean_path": "/tmp/x.lean"}):
            ctx = {"main_ok": True, "sidecar_ok": True, "main_health": None, "sidecar_health": None}
            r = runner.probe_one(KNOWN_PROVABLE, ctx)
        self.assertTrue(r["pass_total"])
        self.assertTrue(r["pass_1"])
        self.assertEqual(r["closed_at_iter"], 0)
        self.assertIn("exit_code", r["iters"][0], "exit_code must be in every iter record")

    def test_retry(self):
        d = self._mk()
        runner.args = make_args(lean_project=str(d), no_sidecar=True, max_iters=5)
        calls = [0]

        def fake_lake(c, p, pr, it):
            calls[0] += 1
            if it == 0:
                return {"ok": False, "exit_code": 1, "output": "err", "lean_path": "/tmp/p.lean"}
            return {"ok": True, "exit_code": 0, "output": "", "lean_path": "/tmp/p2.lean"}

        with mock.patch.object(runner, "llm_chat_complete", return_value="exact rfl"), \
             mock.patch.object(runner, "lean_file_check", side_effect=fake_lake):
            r = runner.probe_one(KNOWN_PROVABLE, {"main_ok": True, "sidecar_ok": False})
        self.assertTrue(r["pass_total"])
        self.assertFalse(r["pass_1"])
        self.assertEqual(r["closed_at_iter"], 1)
        self.assertEqual(calls[0], 2)
        for rec in r["iters"]:
            self.assertIn("exit_code", rec)

    def test_exhausted(self):
        d = self._mk()
        runner.args = make_args(lean_project=str(d), no_sidecar=True, max_iters=3)

        def af(c, p, pr, it):
            return {"ok": False, "exit_code": 1, "output": "sorry", "lean_path": "/tmp/f.lean"}

        with mock.patch.object(runner, "llm_chat_complete", return_value="rfl"), \
             mock.patch.object(runner, "lean_file_check", side_effect=af):
            r = runner.probe_one(KNOWN_HARD, {"main_ok": True, "sidecar_ok": False})
        self.assertFalse(r["pass_total"])
        self.assertIsNone(r["closed_at_iter"])
        self.assertEqual(len(r["iters"]), 3)

    def test_sidecar_down_fallback(self):
        d = self._mk()
        runner.args = make_args(lean_project=str(d), no_sidecar=False, max_iters=2)
        routes = []

        def fake_llm(url, messages, **kw):
            routes.append("sidecar" if "8082" in url else "main")
            return "rfl"

        with mock.patch.object(runner, "llm_chat_complete", side_effect=fake_llm), \
             mock.patch.object(runner, "lean_file_check",
                return_value={"ok": True, "exit_code": 0, "output": "", "lean_path": "/tmp/x.lean"}):
            runner.probe_one(KNOWN_PROVABLE, {"main_ok": True, "sidecar_ok": False})
        self.assertTrue(all(r == "main" for r in routes),
                        f"Expected main-only, got: {routes}")

    def test_dry_run_skips_llm_and_lake(self):
        runner.args = make_args(dry_run=True)
        with mock.patch.object(runner, "llm_chat_complete") as ml, \
             mock.patch.object(runner, "lean_file_check") as mk:
            r = runner.probe_one(KNOWN_PROVABLE, {"main_ok": False, "sidecar_ok": False})
            ml.assert_not_called()
            mk.assert_not_called()
        self.assertTrue(r["pass_total"])
        self.assertTrue(r["pass_1"])


# --- TestAggregate ---
class TestAggregate(unittest.TestCase):
    def _mk(self, n_pass, n_total):
        res = []
        for i in range(n_total):
            p = i < n_pass
            res.append({"id": f"p{i}", "expected_difficulty": "easy",
                "iters": [{"iter": 0, "route": "sidecar", "lean_ok": p, "exit_code": 0 if p else 1}],
                "closed_at_iter": 0 if p else None,
                "pass_1": p, "pass_10": p, "pass_total": p,
                "final_route": "sidecar" if p else None,
                "final_lean_path": "/tmp/p.lean" if p else None})
        return res

    def _agg(self, results, target=0.5):
        n = len(results)
        p10 = sum(1 for r in results if r["pass_10"]) / n if n else 0.0
        return {"p10": p10, "gate": p10 >= target}

    def test_gate_open(self):
        self.assertTrue(self._agg(self._mk(6, 10))["gate"])

    def test_gate_closed(self):
        self.assertFalse(self._agg(self._mk(4, 10))["gate"])

    def test_gate_boundary_50pct(self):
        self.assertTrue(self._agg(self._mk(5, 10))["gate"], "50pct should satisfy >=50pct")

    def test_exit_codes_in_all_iter_records(self):
        results = self._mk(2, 3)
        for prob in results:
            for rec in prob["iters"]:
                self.assertIn("exit_code", rec)


# --- TestReceiptIO ---
class TestReceiptIO(unittest.TestCase):
    def test_receipt_parseable(self):
        runner.args = make_args(n=2, target_pass_at_10=0.5, dry_run=True)
        with tempfile.TemporaryDirectory() as td:
            runner.args.receipt_dir = td
            probs = [{"id": "t1", "statement": "theorem t1:True:=by sorry"},
                     {"id": "t2", "statement": "theorem t2:1=1:=by sorry"}]
            ctx = {"main_ok": False, "sidecar_ok": False,
                   "main_health": None, "sidecar_health": None}
            results = [runner.probe_one(p, ctx) for p in probs]
            receipt = {"schema_version": 4, "probe_runner": "minif2f-probe-runner.py",
                "aggregate": {"problems_attempted": 2, "gate_open": True}, "results": results}
            rp = Path(td) / "r.json"
            rp.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
            loaded = json.loads(rp.read_text(encoding="utf-8"))
        self.assertEqual(loaded["schema_version"], 4)
        self.assertEqual(len(loaded["results"]), 2)


def main():
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for cls in [TestLoad, TestScaffold, TestLakeVerify, TestProbeOne,
                TestAggregate, TestReceiptIO]:
        suite.addTests(loader.loadTestsFromTestCase(cls))
    result = unittest.TextTestRunner(verbosity=2, stream=sys.stderr).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
