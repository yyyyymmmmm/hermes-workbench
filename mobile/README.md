# Mobile preview

Android and iOS native projects are generated with Capacitor 8.5.2. The current
entry points use a native WebView with a narrow health/calendar message bridge.
Only the selected HTTPS origin's main frame can request one of the allowlisted
read operations. Each request requires native recipient/range confirmation and
system permission. Navigating or changing server invalidates pending results.

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

## Device data

Seven individually selectable read types: today's steps, past-24-hour asleep-stage
duration and the most recent weight,
resting heart rate, body fat, oxygen saturation and blood glucose within seven days.
Android uses Health Connect (Android 9+); iOS uses HealthKit. Empty HealthKit results
do not prove authorization was granted. No write or background health permission.
Sleep summaries clip to the requested window and union overlapping asleep stages
across sources. Awake, in-bed and unspecified session-only records do not count.
Missing stages return no data, not zero. Oversized result sets fail instead of
silently reporting a partial duration. Android unit tests cover clipping and overlap.
System calendar reads titles and times for the next seven days, capped at 100.
Scheduled workbench tasks can open a prefilled system event editor. Android reports
only editor_opened, because its calendar intent cannot reliably verify saving.
iOS reports the EventKit editor's saved/cancelled action. Neither result links a
remote event to a task or enables two-way sync; repeating may create duplicates.

The web UI retains results in memory, clears them on logout, and does not persist
or upload them automatically. Native confirmation discloses that selected results
are delivered to website JavaScript: a third-party workspace can behave differently.
Sharing a health summary prepares an independent Hermes draft after recipient and
content confirmation; it does not send automatically. Past remote copies cannot be
recalled by revoking device permissions. Keep shared summaries non-diagnostic.

## Remaining work

Exercise, additional health types, direct calendar sync, native attachment
pickers, native voice, offline data and background sync remain separate work.
Permission revocation is handled in system settings; clearing web results does
not revoke OS permissions. Device-level tests with denied/partial/revoked access,
provider availability, multiple sources and account switching are release gates.

A thin WebView shell alone is not an App Store-ready product. Native integration,
accessibility, device testing, privacy disclosures and review compliance are still
required. Build success does not establish runtime UX or authorization correctness.
