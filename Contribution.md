
1. Go to the apps/lms directory of your installation and execute git pull --unshallow to ensure that you have the full git repository. Use this project’s `invdr/lms-school` remote (or your own fork for external contributions).
1. Check out a working branch in git (e.g. git checkout -b my-new-branch).
1. Make your proposed changes to the source
1. Run your local version (e.g. bench start in your bench installation). Make sure that your changes work the way you want them to.
1. Before every push, run `bash tools/check-quick.sh` and relevant backend integration tests from [TESTING.md](TESTING.md). CI runs the full backend, Linux build and smoke gates. Use `bash tools/check-local.sh` and the three built-in-browser scenarios for release verification when CI is unavailable; do not repeat the full local run after successful CI without a reason.
1. Commit your changes to your branch. Install the local push hook with `corepack yarn hooks:install`.
1. Push your branch to your fork on Github, and issue a pull request.
