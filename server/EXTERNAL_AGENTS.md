# Native Hermes integration boundaries

The workbench keeps native Hermes as its only execution and conversation core.
External coding CLIs are optional tools, not separate workbench chat agents.

## Project operation receipts

Each user submission in an authorized project conversation includes up to twelve
recent task-operation outcomes for that same owner, project and conversation.
Applied, undone, invalid, dismissed and pending states are distinguished. Failed
manual application preserves its error code without committing a partial batch.
Current task versions take precedence over historical receipt versions. No task
receipts are sent without task-read permission. Applying a proposal does not
automatically send another prompt or incur another inference call.

This remains a structured proposal protocol, not native business-tool RPC. Outcomes
reach Hermes on the next user submission; there is no automatic remote push.

## External CLI diagnostics

GET /api/hermes/external-agents uses the account's authenticated Hermes connection
to inspect the API schema and documented terminal backend status. Terminal readiness
does not establish CLI installation, authentication or callable integration.
All three CLI states remain unknown until a dedicated adapter can verify them.
Generic plugins, model providers and the Codex image plugin are not CLI evidence.

The UI prepares an independent, unsent diagnostic or planning draft. It never
automatically installs software or submits that draft. Read-only wording is a
request to the remote agent, not an enforced sandbox; remote tool permissions and
approvals remain essential. Deployment details and a restricted management adapter
are still required for verified installation, version management and authentication.
No Studio implementation is included.

## Verification

Unit tests: server/tests/external-agents.test.mjs and project-chat.test.mjs.
Browser tests: server/tests/external-agents-browser.cjs and project-chat-browser.cjs.
These tests use isolated fixtures, not live NAS CLI installation or model inference.
