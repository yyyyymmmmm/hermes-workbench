# Agent profiles

## Product direction override

The user clarified that this product is a Hermes-connected workbench, not an Agent
software manager. The shipped UI therefore has no profile directory, creation flow,
or Agent picker. It offers only Hermes > Collaboration, editing the connected
server's default delegation/tool/runtime settings. Per-conversation collaboration
preference lives in context settings, not the main composer toolbar. Backend profile
binding remains compatible with persisted records; the broader profile-management
work below is internal groundwork, not a shipped multi-Agent product claim.

Schema 9 binds each workbench conversation to an immutable remote profile. Existing
conversations migrate to `default`. Session create/resume, prompt submission,
interrupt, and reconciliation carry that profile. Project authorization and task
proposal processing remain independent and unchanged. Choosing a different Agent
starts a new conversation, discards unsent content only after confirmation, and
retains the selected project's authorized scope for the next explicit consent.

## Supported management

- List and create native profiles; creation explicitly requests no cloning and no
  inherited skill collection. Actual inherited provider behavior is upstream-owned.
- Read/write description and SOUL content, with readback verification.
- Read/write exposed numeric execution and delegation limits and orchestrator
  setting. Only allowlisted fields are patched; credentials/raw config are never
  returned or written back.
- Toggle native toolsets for an explicit profile and verify the returned state.
  Native toolsets may be platform-specific: this is not a universal sandbox or a
  guarantee that every active session hot-reloads tool permissions.
- Refresh available models and set a profile's new-session default model. The
  global active profile is never switched. Existing conversations are not hot-swapped.
- Pause admission for this workbench account/connection/profile. This is a local
  admission policy, not a remote stop, credential revocation, or other-client block.

All writes require authentication, CSRF, explicit confirmation, and allowlisted
input. Profile settings use preflight revisions bound to the connection and account;
the upstream has no verified compare-and-swap operation, so external-client races
remain possible. Local configuration writes are serialized by origin, and profile
edits reject existing local active/unknown runs against that origin. Uncertain
write results are not automatically retried. User-authored SOUL is intentionally
an instruction file, not an access-control boundary.

The NAS was inspected read-only for OpenAPI schemas, list response fields, soul
response fields, and exposed runtime fields. Actual mutations and non-default
inference are covered with isolated transport/browser fixtures, not real NAS writes.

## Explicit remaining work

Profile rename/delete/import/export, runtime restart, per-profile Skills/MCP/voice/
memory editors, independently controllable child-agent execution trees, and durable
scheduled workflows are not implemented in this increment. Existing memory, voice,
Skills/MCP, and scheduling tabs continue to target the shared `default` profile.
Native delegation does not automatically select a persistent profile from this
directory; it follows the remote delegation tool's model and runtime configuration.
Default local runs still allow one in-flight/unknown run per account; native child
concurrency is controlled on the Hermes server, not by spawning extra local runs.

The workbench still uses authorized snapshots and reviewed task proposals, not a
native bidirectional MCP business-tool bridge. Google synchronization, health APIs,
and native mobile clients are separate unfinished integrations. No Studio source
was copied; its BSL-1.1 commercial restrictions remain relevant for future reuse.
