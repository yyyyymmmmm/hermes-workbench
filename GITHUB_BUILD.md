# Repository and builds

Target: https://github.com/yyyyymmmmm/hermes-workbench.
Public visibility was explicitly approved by the owner before the first push.

## Current workflows

- Verify: Node 24, clean dependency install, server unit tests on pull requests
  and main branch pushes. No production secrets required.
- Windows Preview: manually triggered unsigned Electron x64 artifact. This is a
  portable client, not a signed installer, and needs a running workbench server.
  Only the desktop directory and the icon-library license are packaged.
- Mobile Preview: Android debug APK and iOS simulator build on native-source changes
  or manual dispatch. Runtime server selection, no compiled-in NAS address.
  iPhone installation still requires Apple signing and distribution credentials.

These workflows have not run on GitHub until code is pushed and Actions executes.
Artifacts are previews, not public releases. No automatic deployment to the NAS.

## Before first publication

The current local repository has an invalid HEAD and an origin pointing at the
third-party reference project. Do not force-push, repair by deleting .git, or push
to that origin. Preserve it and migrate reviewed source into a clean checkout of
the target repository after GitHub authentication is available.

Use an explicit source allowlist: web, server, desktop, required ui assets,
package manifests, workflows and reviewed documentation. Do not copy reference
repositories or their history. Review licenses for every bundled asset.

Never upload api/, .runtime/, .env.local, user databases, backups, node_modules,
test screenshots, signing credentials or SSH private keys. Ignore rules are a
guardrail, not a substitute for checking the actual staged files for secrets.
Store future signing credentials in GitHub environment secrets with approval
gates; never expose them to pull-request workflows.
