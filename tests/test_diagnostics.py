import importlib.util
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

MODULE = Path(__file__).resolve().parents[1] / "src" / "diagnostics.py"
spec = importlib.util.spec_from_file_location("diagnostics", MODULE)
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


class DiagnosticsTests(unittest.TestCase):
    def test_host_and_port_validation(self):
        self.assertEqual(diagnostics.bounded_host("localhost"), "localhost")
        self.assertEqual(diagnostics.bounded_port("443"), 443)
        self.assertEqual(diagnostics.bounded_host("netshield-lab-web"), "netshield-lab-web")
        for host in ("", "bad host", "x..y", "a" * 254):
            with self.assertRaises(ValueError): diagnostics.bounded_host(host)
        for host in ("example.com", "8.8.8.8", "2001:4860:4860::8888"):
            with self.assertRaises(ValueError): diagnostics.bounded_host(host)
        for port in ("0", "65536", "oops"):
            with self.assertRaises((ValueError, TypeError)): diagnostics.bounded_port(port)

    def test_tcp_target_is_operator_scoped_and_port_bounded(self):
        result = diagnostics.tcp_check("127.0.0.1", 1, timeout=999)
        self.assertEqual(result["status"], "failed")
        self.assertLessEqual(result["elapsed_ms"], 5100)

    def test_inventory_requires_exact_lab_container_and_network(self):
        with self.assertRaises(ValueError): diagnostics.owned_container_inventory("database")
        runner = lambda *a, **kw: SimpleNamespace(returncode=0, stdout='{"brutehost-netshield-lab":{}}')
        result = diagnostics.owned_container_inventory("netshield-lab-web", runner)
        self.assertEqual(result["status"], "present")
        outside = lambda *a, **kw: SimpleNamespace(returncode=0, stdout='{"bridge":{}}')
        self.assertEqual(diagnostics.owned_container_inventory("netshield-lab-web", outside)["status"], "outside_lab_network")

    def test_log_redaction_and_file_bound(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "safe.log"
            path.write_text("service healthy\npassword=TEST_VALUE_REDACT\n")
            result = diagnostics.sanitize_log(path)
            rendered = str(result)
            self.assertNotIn("do-not-echo", rendered)
            self.assertIn("REDACTED", rendered)
            path.write_text("x" * (diagnostics.MAX_LOG_BYTES + 1))
            with self.assertRaises(ValueError): diagnostics.sanitize_log(path)

    def test_route_collection_is_read_only(self):
        result = diagnostics.route_snapshot()
        self.assertIn(result["status"], {"available", "unavailable"})
        self.assertTrue(isinstance(result.get("routes", []), list))


if __name__ == "__main__":
    unittest.main()
