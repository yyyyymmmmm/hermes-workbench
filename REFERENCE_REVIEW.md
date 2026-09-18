# Hermes Studio Review

Reviewed repository: https://github.com/EKKOLearnAI/hermes-studio
Commit: 0d0d1aa76ca185bd65c9b240a3fad5d6d415fb6d
Review date: 2026-09-18

## License Boundary

The project is now named Ekko Studio. Its LICENSE is BSL-1.1 with a
non-commercial additional use grant; commercial embedding requires a
separate license. The stated change date is 2029-05-10. This workbench
does not incorporate its source code or dependencies. The checkout under
.runtime is for review only and is excluded from the distributable.

## Reviewed Surfaces

- packages/client/src/views/hermes/McpManagerView.vue: searchable server
  collection, per-server tools and separate configuration input.
- packages/client/src/views/hermes/SkillsView.vue and components/hermes/
  skills/SkillImportModal.vue: category/source separation, list/detail,
  read-only sources, folder and ZIP imports.
- packages/client/src/components/hermes/chat/SessionSearchModal.vue:
  recent sessions, message search, bounded results, request sequencing.
- packages/client/src/components/hermes/chat/SessionListItem.vue:
  selection, profile identity, pinned/unread/running state and actions.
- ARCHITECTURE.md and server/modules/hermes/controllers/mcp.ts:
  product-owned session data stays separate from agent-owned data; their
  MCP controller delegates to a local Python bridge, not our NAS REST API.

## Applied Independently

- Capability type tabs, name/description search, enabled-state filter,
  ten-item pages; no silent 300-entry truncation of upstream lists.
- External HTTPS MCP creation, duplicate-name detection, explicit consent,
  public-address validation, readback, existing OAuth/verification actions.
- Connection management is also present under Connections & Data.
- Account-scoped full local conversation title/message search, 20 results
  per page, not restricted to the existing recent-100 dropdown.
- Classified MCP dependency/auth/network failures without forwarding
  secrets or raw gateway tracebacks.

## Confirmed NAS Failure

Asana connection test returned HTTP 200 with ok:false and:
`mcp.client.streamable_http is not available`.
The gateway advises upgrading its mcp package for HTTP transport.
Only connection testing was performed; no Asana tasks were read or changed,
no gateway dependencies were upgraded, and no authorization was granted.
The workbench now reports MCP_HTTP_UNAVAILABLE instead of HERMES_REJECTED.

## Remaining Product Work

1. Skills Hub source review, pinned versions, security-scan results,
   install-job tracking, ZIP traversal/bomb protection, upgrade/uninstall.
2. Custom bearer-token/environment/stdio MCP configuration with encrypted
   secrets and deployment-side execution isolation. HTTPS custom URLs
   currently accept none/OAuth auth, not arbitrary installer commands.
3. Session rename/pin/archive, grouping and runtime/profile ownership;
   importing remote history is separate from searching workbench history.
4. Google OAuth client registration, encrypted refresh tokens, background
   sync, scopes, revocation and conflict handling. MCP tool availability is
   not evidence of Tasks/Calendar/Gmail database synchronization.
5. Native HealthKit/Health Connect permission adapters.

External URLs are prevalidated from the workbench host. The NAS must enforce
its own egress policy against redirects and DNS rebinding. Supported gateway
versions need a published compatibility matrix and real third-party testing.
