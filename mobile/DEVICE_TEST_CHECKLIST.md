# Device release gates

CI compilation and browser bridge fixtures do not replace real-device tests.

## Health

- Fresh install: no system permission prompt until an explicit read request.
- Select one metric, then all seven. Native recipient and scope must be correct.
- Deny, partially grant, and revoke in system settings. No missing values become 0.
- Android without Health Connect: actionable unavailable state, no fake records.
- iOS HealthKit read denial: empty results must not imply read authorization.
- Overlapping sleep stages, awake/in-bed intervals and sessions crossing midnight.
- No sleep stages, more than 1000 source records, multiple source devices.
- Switch server, navigate, sign out, or close while a permission dialog is open:
  old results must not enter a different page/account.
- Summary sharing: confirm exact recipient and selected data; draft only, never
  automatic inference or background upload. Clear results and inspect app restart.

## Calendar

- Deny or revoke read permission, empty calendars, all-day and recurring events.
- Seven-day boundary, 100-event cap, DST and device timezone change.
- Select a scheduled task and inspect title/start/end in the native editor.
- Cancel editing: original task is unchanged and no success claim.
- Save on iOS: saved callback. Android: only editor-opened acknowledgement.
- Missing Android calendar app: unavailable response, no task mutation.
- Wait longer than the web request timeout before saving: no automatic retry.
- Repeated export must warn of possible duplicates; there is no sync mapping yet.

## Distribution

Android Play health declaration/privacy policy and iOS HealthKit signing capability,
privacy disclosures and TestFlight validation are still required. No medical-device
claims, diagnosis, medication recommendations or emergency exclusion based on these
limited summaries. App Store suitability is not established by a successful build.
