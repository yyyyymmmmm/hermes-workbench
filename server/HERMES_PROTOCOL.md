# Gateway management protocol

## Verified Contracts Added 2026-09-18

- GET `/api/model/options?profile=default&explicit_only=1&refresh=true` refreshes the catalog. POST `/api/model/set?profile=default` takes `scope:main`, provider, model, profile and explicit `confirm_expensive_model`. It changes new sessions only. The adapter checks the prior selection and re-reads the catalog; no undocumented session hot-swap is used.
- Model labels prefer persisted session create/resume metadata. When no model is returned, a new session records the cached catalog selection as a configuration snapshot, not a verified inference model. Legacy conversations without metadata display the server default name with an explicit provenance tooltip. A global default change never overwrites a recorded conversation label.
- Hub sources returns `featured` and `installed` keyed by identifier. Search returns `results`. Preview returns `identifier`, `name`, `skill_md`, `files`. Scan returns `identifier`, `verdict`, `policy`, `findings`, `summary`. These were inspected on the configured NAS without installation.
- Official hub search/review/install is now implemented, superseding the older discovery-only note below. A successful installer response is insufficient: installed skill name and source provenance must both be read back. Only safe/allow scans without high/critical findings are eligible. No bundle digest pinning exists in the discovered API; preview and re-scan are not an atomic supply-chain guarantee.

Read-only discovery on 2026-09-18 used the configured NAS session and
`GET /openapi.json`. No installation, configuration write, inference or
OAuth flow was performed against that server.

- Config: GET/PUT `/api/config?profile=default`, body `{config: {...}}`.
  The MCP map replacement endpoint documentation explicitly states that
  the generic config endpoint deep-merges maps. Send only edited fields.
  No documented conditional-write contract; revision preflight is not CAS.
- Catalog: GET `/api/mcp/catalog?profile=default`, response `entries`.
  Entries include name, transport, required_env, needs_install, installed,
  enabled and post_install. Forward only display and eligibility fields.
- Catalog install: POST `/api/mcp/catalog/install?profile=default`,
  `{name, env: {}, enable: false, profile: "default"}`. Re-read the catalog.
  This client accepts only HTTP entries without required env or bootstrap.
  No automatic retries on write or readback failures.
- Skills: POST `/api/skills/hub/install`, `{identifier, profile}`;
  GET `/api/skills/hub/preview` and `/api/skills/hub/scan` accept identifier.
  Discovered, not implemented: response verification and install tracking
  still required. Do not bypass scanner or invoke arbitrary shell installers.
- MCP delete/test/OAuth now use the gateway's shipped McpPage and API
  client response contracts, inspected read-only. OAuth starts with
  flow_id and authorization_url; status is approved/error/pending.
  Only HTTPS authorization links without embedded credentials are exposed.
  Local opaque flow IDs bind to owner, connection and server name, expire
  after five minutes and can be resumed after page reload. Server restart
  drops in-flight mappings; start again after remote expiry. No token fields
  or raw flow errors are forwarded. Cancellation calls upstream DELETE.
- Explicit verify-and-enable runs POST test first, requires ok:true and
  a tools array, then PUT enabled:true and checks the server list. Existing
  sessions may require recreation or gateway restart; no automatic restart.
  Removal is verified by re-reading the server list and does not revoke
  third-party OAuth grants. Custom MCP creation is still not exposed.
- Toolset PUT `/api/tools/toolsets/{name}` takes enabled and profile;
  not wired in the current UI. Its documented platform behavior differs
  from editing agent.disabled_toolsets; do not assume they are equivalent.

Supported operations have mock transport and browser tests. Live writes
remain a release acceptance requirement with the server owner's consent.
