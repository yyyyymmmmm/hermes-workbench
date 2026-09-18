# Collaboration, conversation metadata, and calendar views

## Native Agent preference

The composer toggle checks `/api/hermes/capabilities/tools` for an enabled toolset
containing `delegate_task`. Every opted-in run repeats this check before opening a
remote session. A disabled or unavailable capability fails the run without sending
the prompt. The preference is stored on the run, included in its idempotency
fingerprint, and restored when revisiting its conversation.

This uses Hermes's native delegation tool through a per-turn orchestration
instruction. It is not a new delegation RPC, a guaranteed parallel execution
scheduler, or a hard tool permission boundary. The model chooses whether and how
to delegate; a simple task may need no child. The ordinary mode leaves remote
Hermes defaults unchanged. Child models, concurrency, workspace isolation, cost
limits, and tool permissions remain controlled by the remote Hermes server.

Only received `tool.start`, `tool.complete`, and `tool.error` events appear in the
activity list. No simulated child progress is displayed. A parent reply completing
does not prove asynchronous children finished. This gateway adapter does not yet
subscribe to child-session snapshots or manage child lifecycle independently;
interrupting the parent is not a verified stop-all-children operation.

No provider credentials or full tool arguments are sent to the browser. Existing
project authorization, task action review, and remote tool approvals remain in
place. Instructions to avoid file conflicts are model guidance, not a filesystem
sandbox. The live NAS was checked read-only and exposes enabled `delegation` /
`delegate_task`; end-to-end multi-agent model execution was not triggered during
verification to avoid model charges and arbitrary remote work.

## Conversation metadata

Schema 8 adds category and optimistic metadata version fields. PATCH accepts a
nonempty title (120 characters), optional free-form category (40 characters), and
the expected metadata version. Owner, CSRF, and stale-update checks apply.
Project binding and authorized context never change when metadata changes.
Recent history covers 100 conversations; paginated full-history search can find
and rename older conversations. Categories organize recent history and do not
grant data access.

## Calendar

Agenda, Monday-first week, and 42-cell month views derive from the existing task
records, using the viewing device's local timezone. Only explicitly scheduled
tasks appear. Week view is a seven-column agenda, not a drag-to-reschedule time
grid. Month cells show three entries and open the complete day via overflow.
All task edits use the existing versioned task API. No second event store or
Google Calendar sync is introduced by these views.
