# UI parity and real management plan

## Scope and evidence

The visual source of truth is ui/index.html -> ui/terminal/views.js,
ui/terminal/features.js and ui/terminal/styles.css. web/ is the live frontend.
No existing model, profile, external agent, attachment, voice, task, calendar,
health, permission, installation or connection functionality may be removed.

The prototype is not a backend: features.js stores persona/memory and schedule
rules locally. Its connections page uses setting rows; the capability page uses
module cards. The requested redesign deliberately extends the two-column card
layout to connections as well.

## Current differences and target

| Area | Prototype / requested interaction | Live implementation gap | Target |
| --- | --- | --- | --- |
| Hermes frame | Status header, fixed tab strip, bounded settings width | Per-section fetch buttons and scattered editors | Preserve all tabs, one page refresh, cached status and consistent settings width |
| Tool groups | Icon, description, checkbox | Some groups display status only | Checkbox controls only supported writable groups; managed scopes shown separately |
| Skills/MCP | Installed entry with Manage button | Inline auth/test/remove/install controls crowd lists | Compact cards; Manage opens an accessible detail panel with the full lifecycle |
| Memory | SOUL and MEMORY content editors | Enable flags and size limits, no content editor | Content and configuration are distinct tabs; server-backed read/edit/history/conflict checks |
| Schedules | New rule, list, pause/resume/delete | Remote list and pause/resume only | Real create/edit/delete, time zone, execution history and error details |
| Capability center | module-grid, icon, category, status, Add/Manage | Reuses Hermes management sections | Two-column library, shared search/filter, fixed page-level Add button |
| Connections | Single Add connection action; requested two-column layout | Mixed setting rows, unavailable placeholders, embedded MCP editor | Two-column connection cards; detail panel owns account auth, scopes and sync controls |

## Cached reads, not empty pages

web/agent.js already has an in-memory data map but relies heavily on explicit
fetchSection actions; it has no durable metadata snapshot or freshness policy.
web/app.js reconciles every 15 seconds, requesting the workbench API. The /hermes
summary reads local connection metadata; this is not proof that every reconciliation
requests the remote NAS. Instrument requests before attributing all slowness to it.

1. Use one capability/connection store shared by all three pages, keyed by account,
   connection ID, agent profile and resource type. Never key only by tab name.
2. Render an available snapshot immediately. First load without data uses skeletons,
   never a mandatory manual Read Server button. Deduplicate concurrent requests.
3. Initial freshness targets: installed items/tools 60 seconds, connection status
   30 seconds, catalog 10 minutes. Tune from measured request costs.
4. Refresh stale visible data in the background. Keep old content on failure and
   display last-success time plus an inline retry action. Refresh does not block tabs.
5. After a mutation, update only the affected resource and perform verification
   readback. Do not evict the entire capability store or silently retry writes.
6. Never replace dirty forms with refreshed server data. Compare revisions and
   offer explicit reload or conflict review. Switching tabs preserves drafts.
7. Clear memory and account-scoped disk snapshots on sign-out or connection change.
   Persist only non-secret catalog metadata by default. Memory content, auth tokens,
   health records and raw provider configuration are not ordinary cache entries.
8. Cached enabled/connected status is informational, never authority to execute.
   Backend ownership and permissions are checked on every write or execution.

## Real memory management

- Separate assistant instructions (SOUL), long-term memory (MEMORY), user profile
  and memory-engine settings; show the active remote profile and sharing boundary.
- Detect supported remote APIs. Do not guess writable NAS paths from the UI.
- Read content plus a revision/hash; save with optimistic concurrency and readback.
- Show preview/diff, unsaved state, conflict recovery and supported version history.
- Editing memory is not guaranteed to affect an already-running conversation;
  report actual activation behavior from the provider contract.
- Never label local drafts as synchronized memory. If an adapter is missing,
  identify that dependency rather than pretending a save succeeded.

## Real schedules

- Create/edit fields: name, prompt, execution profile/model policy, schedule,
  IANA time zone, enabled state and destination supported by the remote API.
- Show next run and last run, with explicit DST and missed-run behavior.
- Create disabled or require explicit enable confirmation. Execution can call
  tools and incur cost; do not equate saving a rule with authorizing every tool.
- Readback verifies create/edit/pause/resume/delete. History links to real remote
  execution records, not simulated progress. Store remote IDs to prevent duplicates.
- Do not create a second independent local scheduler for the same remote job.

## Page and interaction contract

- Desktop: a shared page header, one primary Add action, compact toolbar, then two
  equal card columns. Mobile: one column; no horizontal page overflow.
- Use the prototype's icon family, soft semantic icon colors, 7-8px card corners,
  fine borders and consistent title/status alignment. Do not nest decorative cards.
- A card shows identity, source/type, status, short description and one Manage or
  Add action. OAuth/test/permissions/uninstall live in its detail panel.
- Header remains available while the list scrolls without covering keyboard focus.
- Long lists paginate/search; preserve filters, scroll position and selected item.
- Detail panels support Escape/back, restore trigger focus and protect dirty forms.
- Animations use shared tokens and reduced-motion settings; loading feedback
  represents actual requests, not artificial timers.

## Delivery and acceptance

1. Shared cache and freshness semantics, with request-count and account-switch tests.
2. Recover the Hermes settings layout and tool/installed-item management controls.
3. Implement verified memory and scheduler adapter contracts, then their editors.
4. Replace capability and connection page lists with the approved two-column cards.
5. Test the existing feature inventory across all themes, English/Chinese,
   desktop/mobile, denied permissions, stale caches and concurrent edits.

Acceptance: revisiting a fresh tab produces no duplicate remote fetch; switching
accounts never flashes the previous account's entries; failed refresh leaves the
last snapshot visible; edited forms survive refresh; a created job exists remotely;
saved memory matches remote readback; installation returns to the originating card;
no existing feature disappears behind the layout migration.
