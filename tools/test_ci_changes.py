import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("ci-changes.py").resolve()


class PackagingSelection(unittest.TestCase):
    def setUp(self):
        # pre-push exports repository-local Git variables. Child repositories
        # must not inherit the parent worktree/index during real-history tests.
        local_variables = subprocess.check_output(
            ["git", "rev-parse", "--local-env-vars"], text=True
        ).splitlines()
        self.env = {key: value for key, value in os.environ.items() if key not in local_variables}
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-b", "develop")
        self.git("config", "user.email", "test@example.test")
        self.git("config", "user.name", "CI selection test")
        self.commit("app.py", "base")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.git("checkout", "-b", "feature")

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, env=self.env, text=True, stderr=subprocess.DEVNULL)

    def commit(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        self.git("add", "--all")
        self.git("commit", "-m", content)

    def select(self, event=None, ref="feature"):
        event_file = self.root / "event.json"
        event_file.write_text(json.dumps(event or {}))
        env = dict(self.env, GITHUB_EVENT_PATH=str(event_file), GITHUB_REF_NAME=ref)
        return subprocess.check_output(
            ["python3", str(SCRIPT), "--base", "develop"], cwd=self.root, env=env, text=True
        ).strip()

    def test_later_source_push_still_checks_prior_dependency_change(self):
        self.commit("frontend/yarn.lock", "dependency update")
        self.commit("app.py", "later source-only push")
        self.assertEqual(self.select(), "packaging=true")

    def test_source_only_feature_does_not_build_image(self):
        self.commit("app.py", "source update")
        self.assertEqual(self.select(), "packaging=false")

    def test_move_out_of_runtime_directory_still_builds(self):
        self.git("checkout", "develop")
        self.commit("docker/config.yml", "runtime config")
        self.git("checkout", "-B", "feature", "develop")
        self.git("mv", "docker/config.yml", "example.yml")
        self.git("commit", "-m", "move runtime config")
        self.assertEqual(self.select(), "packaging=true")

    def test_primary_push_compares_previous_commit(self):
        self.commit("pyproject.toml", "dependencies")
        self.assertEqual(self.select({"before": self.base}, ref="develop"), "packaging=true")

    def test_new_primary_branch_fails_closed(self):
        self.assertEqual(self.select({"before": "0" * 40}, ref="develop"), "packaging=true")

    def test_release_branch_fast_forward_from_develop_keeps_packaging_change(self):
        self.git("checkout", "develop")
        self.commit("pyproject.toml", "new runtime dependencies")
        for branch in ("master", "main"):
            with self.subTest(branch=branch):
                self.git("checkout", "-b", branch, "develop")
                self.assertEqual(self.select({"before": self.base}, ref=branch), "packaging=true")

    def test_pr_uses_base_sha(self):
        self.commit("docker/init.sh", "runtime update")
        self.assertEqual(self.select({"pull_request": {"base": {"sha": self.base}}}), "packaging=true")


if __name__ == "__main__":
    unittest.main()
