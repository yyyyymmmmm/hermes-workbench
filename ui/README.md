# Hermes Personal Terminal UI

Open `index.html` directly in a browser. No installation or development server is required.

This is a standalone, responsive UI prototype with local demonstration data. It does not connect to Hermes Agent, calendar providers, or health services.

Current source files are in `terminal/`. The previous UI is preserved in `classic.html`.

Implemented interactions:

- Dashboard, editable code/document workspaces, split views, local draft persistence, sample diff approval, and simulated execution output.
- Real independent browser windows with localStorage updates. Unsaved drafts remain local; this is not production cloud synchronization or conflict resolution.
- Shared task/calendar records: scheduling, conflict checks, rescheduling, completion progress, and unscheduling without deleting the task.
- Model/provider/fallback configuration, tool permissions, Skills/MCP, memory/persona drafts, and local schedule rules.
- Capability catalog and user-defined module, MCP, Skill, and connector configurations. No external code is downloaded or executed.
- Demo account switching and device pairing, health summary, search, export, responsive navigation, and keyboard-accessible dialogs.
- Browser/system voice selection, rate, speech synthesis, speech recognition, and a continuous local-preview conversation loop. Recognition only starts after an explicit microphone action; closing the dialog stops it. Availability depends on system voices, browser permissions, and the browser's recognition service. This is not a real Hermes voice session.

Data is saved in browser localStorage. Browser file-origin storage behavior can vary. Clearing site data resets the preview. Existing V1 tasks and notes are imported when available. The displayed date and health metrics are fixed examples. Authentication, cloud synchronization, external OAuth, actual code execution, and server-side Hermes configuration are not implemented. Do not store credentials in this prototype.

`terminal/verify.cjs` verifies the current UI, including real popup and cross-window updates, shared task/calendar state, model configuration, voice UI, and mobile layouts. It does not test microphone hardware or online speech recognition. `verify.cjs` verifies the archived first version. Both use this machine's bundled Playwright runtime. Current screenshots use the `screenshots/v2-` prefix.

Assets: Lucide icons (ISC license, see `assets/lucide-LICENSE`); sample account photo from Unsplash (`photo-1472099645785-5658abf4ff4e`). The photo is a placeholder, not the user's identity.
