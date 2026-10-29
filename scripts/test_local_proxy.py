#!/usr/bin/env python3
"""Exercise the built nginx image against a disposable synthetic account API."""

import argparse
import hashlib
import http.client
import json
import subprocess
import threading
import time
import unittest
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class AccountFixture(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.respond()

    def do_POST(self):
        self.respond()

    def respond(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if self.path.startswith("/r/"):
            self.send_response(302)
            self.send_header("Location", "/tracks/fixture-project")
            self.end_headers()
            return
        payload = json.dumps({
            "service": "fixture-account-api",
            "path": self.path,
            "method": self.command,
            "headers": dict(self.headers),
            "size": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Set-Cookie", "a2m_session=fixture; Path=/; HttpOnly; SameSite=Lax")
        self.end_headers()
        self.wfile.write(payload)


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True, timeout=60).strip()


class ProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = f"audio2midi-proxy-test-{uuid.uuid4().hex[:10]}"
        cls.upstream = ThreadingHTTPServer((OPTIONS.bind, 0), AccountFixture)
        cls.addClassCleanup(cls.upstream.server_close)
        threading.Thread(target=cls.upstream.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.upstream.shutdown)
        cls.addClassCleanup(docker, "rm", "-f", cls.container)
        docker(
            "run", "--detach", "--rm", "--name", cls.container,
            "--publish", "127.0.0.1::80",
            "--add-host", "host.docker.internal:host-gateway",
            "--env", f"ACCOUNT_API_UPSTREAM=host.docker.internal:{cls.upstream.server_port}",
            OPTIONS.image,
        )
        cls.port = int(docker("port", cls.container, "80/tcp").split(":")[-1])
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            try:
                if cls.request("GET", "/api/health")[0] == 200:
                    return
            except OSError:
                pass
            time.sleep(0.2)
        raise RuntimeError("local proxy did not become ready\n" + docker("logs", cls.container))

    @classmethod
    def request(cls, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=10)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_frontend_and_spa_routes(self):
        for route in ["/", "/new", "/tracks/fixture-project"]:
            with self.subTest(route=route):
                status, _, body = self.request("GET", route)
                self.assertEqual(status, 200)
                self.assertIn(b'/assets/index-', body)

    def test_health_distinguishes_frontend_and_api(self):
        for route, service in [("/health", "audio2midi-web"),
                               ("/api/health", "fixture-account-api")]:
            with self.subTest(route=route):
                status, _, body = self.request("GET", route)
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["service"], service)

    def test_account_path_query_auth_and_cookies(self):
        status, headers, body = self.request(
            "GET", "/api/v1/me/projects?cursor=one%20two&limit=5",
            headers={"Cookie": "a2m_session=fixture", "Authorization": "tma synthetic",
                     "X-Research-User": "forged", "X-Research-Gateway": "forged"},
        )
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data["path"], "/v1/me/projects?cursor=one%20two&limit=5")
        self.assertEqual(data["headers"]["Cookie"], "a2m_session=fixture")
        self.assertEqual(data["headers"]["Authorization"], "tma synthetic")
        self.assertEqual(data["headers"]["X-Forwarded-Proto"], "http")
        self.assertNotIn("X-Research-User", data["headers"])
        self.assertNotIn("X-Research-Gateway", data["headers"])
        self.assertIn("a2m_session=fixture", headers["Set-Cookie"])

    def test_upload_over_default_nginx_one_megabyte_limit(self):
        source = b"synthetic audio\n" * 100_000
        status, _, body = self.request(
            "POST", "/api/v1/me/projects/fixture/source", body=source,
            headers={"Content-Type": "audio/mpeg", "X-Audio-Sha256": "fixture-hash"},
        )
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertEqual(data["method"], "POST")
        self.assertEqual(data["size"], len(source))
        self.assertEqual(data["sha256"], hashlib.sha256(source).hexdigest())
        self.assertEqual(data["headers"]["Content-Type"], "audio/mpeg")
        self.assertEqual(data["headers"]["X-Audio-Sha256"], "fixture-hash")

    def test_oversized_upload_is_rejected_before_body(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            conn.putrequest("POST", "/api/v1/me/projects/fixture/source")
            conn.putheader("Content-Length", str(22 * 1024 * 1024))
            conn.endheaders()
            self.assertEqual(conn.getresponse().status, 413)
        finally:
            conn.close()

    def test_campaign_redirect_preserves_backend_path(self):
        status, headers, _ = self.request("GET", "/r/abc123?source=local")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "/tracks/fixture-project")
        self.assertEqual(self.request("POST", "/r/abc123")[0], 403)

    def test_api_root_redirect_keeps_query(self):
        status, headers, _ = self.request("GET", "/api?source=local")
        self.assertEqual(status, 308)
        self.assertTrue(headers["Location"].endswith("/api/?source=local"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", help="locally built Dockerfile.frontend image")
    parser.add_argument("--bind", default="127.0.0.1",
                        help="fixture bind address; on Linux use the host bridge address")
    OPTIONS = parser.parse_args()
    unittest.main(argv=[__file__], verbosity=2)
