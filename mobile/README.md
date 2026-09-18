# Mobile preview

Android and iOS native projects are generated with Capacitor 8.5.2. The current
entry points deliberately use an isolated native WebView without exposing a
Capacitor JavaScript bridge to user-selected remote servers.

Users choose their own HTTPS workbench server at runtime. No NAS hostname,
workbench domain, password or Google OAuth credential is compiled into the app.
After workbench login, users configure their own Hermes connection in the existing
Hermes settings. A Hermes-only API endpoint is not a workbench server.

Server preferences store only an origin. Web sessions use the platform's WebView
cookie store. Native server switching requires confirmation; it does not revoke
the previous server session. Sign out first on shared devices. HTTP and mixed
content are disallowed. External HTTPS navigation requires user confirmation.

## Build

Run npm ci in this directory, then npm run sync:android or npm run sync:ios.
Android requires SDK 36 and Java 21; run bash gradlew assembleDebug in android.
iOS requires Xcode on macOS; GitHub Mobile Preview runs a simulator build without
Apple signing. Simulator artifacts cannot be installed on an iPhone.

GitHub builds provide an Android debug APK and an iOS simulator artifact, not store
releases. TestFlight needs Apple membership, registered app identity and signing.
The package identity site.hermes.workbench is provisional; confirm ownership and
availability before publishing to either store.

## Not yet implemented

HealthKit, Health Connect, EventKit, Android calendar access, native attachment
pickers, native voice, offline data and background sync remain separate work.
No health/calendar system permission is requested in this preview. Do not expose
those capabilities to arbitrary remote JavaScript. Implement native consent and
an explicitly scoped data-transfer protocol before adding a bridge.

A thin WebView shell alone is not an App Store-ready product. Native integration,
accessibility, device testing, privacy disclosures and review compliance are still
required. Build success does not establish runtime UX or authorization correctness.
