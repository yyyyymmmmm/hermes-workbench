# Project conversation contract

Schema version 7 adds immutable conversation project ownership, per-conversation
read grants, run context snapshots, project auto-create policy and action receipts.
Back up the database and vault key before deployment. Version 6 applications cannot
open the migrated database; rollback requires restoring a complete backup.

## Current transport

The existing Hermes gateway accepts text prompts. This implementation appends an
explicit structured proposal contract and authorized project snapshot to each
project prompt. A completed reply can contain one `hermes-actions` JSON code block.
This is not an installed MCP server or native remote tool callback. Models that
ignore the contract cannot write tasks. Ordinary prose and Markdown checklists
never trigger this automatic path. Legacy checklist import remains confirmation-only
and is disabled for replies with a structured action record.

## Authorization and consistency

- Project switching creates a new conversation, without its previous history/files.
- Project description is shared after project consent. Tasks and up to three linked
  documents require separate selection. A snapshot is taken before each submission.
- Missing, unlinked or archived resources fail closed. Context is limited to 96 KB
  and 200 tasks. Health data is never included.
- Proposed updates/deletes must match IDs and versions in that run's authorized
  snapshot and still belong to the project. Each batch is one SQLite transaction.
- All operations require confirmation by default. Explicit project policy permits
  batches of up to ten creates only. Updates, completion and deletion still require
  review. Uploaded or retrieved content can influence model proposals: auto-create
  is opt-in, not a prompt-injection security boundary.
- Receipt identity is the source run, so repeated confirmation cannot duplicate a
  batch. Undo checks every resulting version and refuses to overwrite newer edits.
- Creates carry source-run provenance. Project views, tasks and the local calendar
  read the same task records; only tasks with scheduledAt appear on the calendar.
- Remote tools remain subject to Hermes's own approval system. This contract does
  not grant remote tools access to the workbench API or to arbitrary projects.

## Verification

`project-chat.test.mjs` tests API scope, consent, persistence, auto-create, conflict,
rollback, undo, provenance and malformed proposals with an isolated mock gateway.
`project-chat-browser.cjs` tests selection in the chat toolbar, context preview,
approval/undo and mobile navigation. These are not proof of compatibility with every
live Hermes model. No live user tasks are generated during automated verification.

## Remaining native integration

A native MCP bridge needs per-user/per-project revocable credentials, a reachable
HTTPS endpoint, remote capability negotiation, tool registration and live end-to-end
verification. Do not label the proposal protocol as that integration. Google OAuth
sync and mobile HealthKit/Health Connect remain separate integrations.

Design guidance installed locally from anthropics/skills, skills/frontend-design.
This is a development skill, not an installation into the user's remote Hermes.
