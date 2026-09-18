# Hosted workbench

The operator deploys this service once. Users open the website or the official
clients, sign in, and bind their own Hermes. A client does not run this backend.

## Deployment

Provide deploy/.env using the keys in .env.example. Set a real hostname with DNS
pointing to this host and make ports 80/443 reachable. The auth application secret
belongs only on this server. Never add it to GitHub variables or client bundles.

Run `docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build`
from the repository root. Caddy obtains HTTPS certificates. Port 4317 is internal.
If an existing NAS reverse proxy owns ports 80/443, integrate with that proxy
instead of running a second listener. Preserve the exact public HTTPS origin.

The workbench-data volume contains the SQLite database and encryption key.
Back up both together and test restores. Do not run multiple workbench replicas
against this volume. This template is a single-instance starting point, not an
HA deployment or a completed production security review.

## Official clients

The default official endpoint is https://hermes.didichou.site. Deployment and DNS
must be completed before clients using this endpoint can sign in.
Set GitHub Actions repository variables WORKBENCH_SERVICE_ORIGIN to override the public
HTTPS origin and WORKBENCH_RELEASE to true, then build Windows and Mobile.
Release validation rejects a missing official origin. The configured official
default is used unless overridden. Desktop builds generate desktop/service-config.json;
mobile builds embed public/service-config.json. Neither file contains credentials.

Fresh installations with an official endpoint open login directly. Existing
self-hosted preferences remain valid; advanced settings still allow self-hosting.
Changing the public endpoint requires rebuilding clients. Keep the hostname stable.

Different accounts must remain isolated; same-account devices use the same server
data. Existing owner and CSRF tests are not a complete multi-tenant security audit.
Do not share a privileged Hermes identity between unrelated users. Hosted servers
cannot reach arbitrary customer LAN addresses. A secure remote Hermes endpoint or
a separately implemented outbound connector is required. No tunnel is included.

## Release gates

Verify real registration/login, device revocation, cross-account API access,
uploads/exports, backups, HTTPS renewal, rate limits, and native sign-in on devices.
Health sharing remains separately authorized. Official service configuration does
not implement offline sync, persistent native login, billing, or App Store signing.
