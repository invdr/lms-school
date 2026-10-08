#!/usr/bin/env python3
"""Select packaging checks from the entire feature branch, never the last push."""
import argparse
import json
import os
import subprocess

PACKAGING_FILES = {
    "package.json", "yarn.lock", "frontend/package.json", "frontend/yarn.lock",
    "pyproject.toml", "MANIFEST.in", ".dockerignore", "frontend/vite.config.js",
}
PACKAGING_PREFIXES = ("docker/", ".github/workflows/", "tools/")


def packaging_changed(paths):
    return any(p in PACKAGING_FILES or p.startswith(PACKAGING_PREFIXES) for p in paths)


def changed_paths(base, head):
    # --no-renames includes both old and new names; moving a packaging file out
    # of a watched directory must still request a build.
    return subprocess.check_output([
        "git", "diff", "--no-renames", "--name-only", "-z", base, head,
    ]).decode().rstrip("\0").split("\0")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", default="HEAD")
    args = parser.parse_args()
    event = {}
    if os.environ.get("GITHUB_EVENT_PATH"):
        with open(os.environ["GITHUB_EVENT_PATH"]) as stream:
            event = json.load(stream)
    head = args.head
    base = args.base
    if event.get("pull_request"):
        # Test the checked-out merge result against the PR base.
        base = event["pull_request"]["base"]["sha"]
    elif os.environ.get("GITHUB_REF_NAME") in {args.base.removeprefix("origin/"), "master", "main"}:
        base = event.get("before", "")
        if not base or set(base) == {"0"}:
            result = True  # no previous primary commit: fail closed
            print(f"packaging={str(result).lower()}")
            return
    else:
        base = subprocess.check_output(["git", "merge-base", base, head], text=True).strip()
    result = packaging_changed(changed_paths(base, head))
    print(f"packaging={str(result).lower()}")


if __name__ == "__main__":
    main()
