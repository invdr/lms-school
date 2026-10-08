#!/usr/bin/env python3
"""Short HTTP smoke: live Frappe API, rendered portal, published production assets."""
import argparse
import json
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        path = attrs.get("src") if tag == "script" else attrs.get("href")
        if path and path.startswith("/assets/lms/frontend/") and path.endswith((".js", ".css")):
            self.paths.append(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:18080")
    parser.add_argument("--site", default="lms.test")
    args = parser.parse_args()
    if urlparse(args.url).hostname not in {"127.0.0.1", "localhost"}:
        parser.error("smoke must target the isolated local test service")
    if not args.site.endswith(".test"):
        parser.error("smoke requires an isolated *.test site")

    def request(path):
        return urlopen(Request(urljoin(args.url, path), headers={"Host": args.site}), timeout=20)

    with request("/api/method/ping") as response:
        assert json.load(response)["message"] == "pong", "Frappe API did not answer"
    with request("/lms") as response:
        html = response.read().decode()
    assert 'id="app"' in html, "portal root is missing"
    assets = Assets()
    assets.feed(html)
    assert any(p.endswith(".js") for p in assets.paths), "portal has no production JS"
    assert any(p.endswith(".css") for p in assets.paths), "portal has no production CSS"
    for path in assets.paths:
        with request(path) as response:
            mime = response.headers.get_content_type()
            assert response.status == 200
            assert mime != "text/html", f"asset fell back to HTML: {path}"
            assert response.read(1), f"empty asset: {path}"
    print(f"Runtime smoke passed: Frappe ping, portal and {len(assets.paths)} production assets")


if __name__ == "__main__":
    main()
