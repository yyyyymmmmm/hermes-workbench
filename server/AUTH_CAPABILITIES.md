# Account service audit

Reviewed bundled PHP source, not production service configuration.

| Capability | Source | Workbench decision |
| --- | --- | --- |
| Application registration | api/api/api/userreg/index.php | Existing signed adapter |
| Application login | api/api/api/userlogon/index.php | Existing signed adapter |
| Initialization / announcements | ini, notice | Not account profile APIs |
| Card authorization / unbinding | kmlogon, kmunmachine | Separate licensing identity, not workbench sessions |
| MT5 login, heartbeat, notification | mt5* | Trading-specific; not a general user API |
| Account edit, reset, balance, points | api/user/ajax.php | Developer administration only; never expose credentials to clients |
| Self-service password change / recovery | Not found in application API directory | Requires a new authenticated upstream contract |
| Session rename / revoke others | Workbench server | Implemented locally, owner-scoped and CSRF protected |

The upstream login response returns `fen` from the QQ column. Do not display it as
points or infer paid entitlements from it. The bundled login code also compares
passwords directly to the stored value. Before commercial launch, migrate upstream
storage to password_hash/password_verify, require TLS, add rate limiting and a
verified recovery challenge. Do not expose developer reset endpoints as self-service.

Workbench session revocation does not stop remote Hermes runs or revoke NAS
credentials. An upstream account ban is currently checked on login, not continuously
revalidated during an existing workbench session. A production status/revocation
contract is required before promising immediate global account suspension.

Profile edits should use an upstream user-scoped, versioned API. Account deletion
requires explicit treatment of local data, remote data, backups and active tasks;
there is deliberately no misleading local-only delete-account button.
