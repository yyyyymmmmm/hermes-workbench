# Fluent-Inspired Appearance

The optional `fluent` theme is selected under Settings > Appearance. Existing
theme choices and the first-run classic default are unchanged. It uses the
same application components and data; no feature is replaced by a mockup.

Reference material:
- Microsoft Fluent 2: https://fluent2.microsoft.design/
- Microsoft Fluent UI: https://github.com/microsoft/fluentui
- Community design skill: https://github.com/Altermoe/fluent2-design-skills

The community `fluent-foundations` skill was reviewed and installed locally
for development. It is not an official Microsoft skill, an application
dependency, or an installation into users' Hermes servers. No remote setup
scripts were run. The product theme is implemented in `web/fluent.css` using
existing component selectors and application tokens, not by importing a
second UI framework.

The appearance uses neutral surfaces, a restrained blue accent, 4px controls,
8px cards, Segoe/system fonts, thin strokes, and contextual elevation.
Translucency is limited to navigation and floating surfaces, with opaque
fallbacks and reduced-transparency support. This is a web interpretation of
Fluent, not native Windows Mica or iOS Liquid Glass.

Navigation layers are shared across all themes: conversation drawer 45,
navigation backdrop 60, navigation drawer 70. On mobile the navigation makes
the application beneath it inert, traps keyboard focus, and closes with its
close button, backdrop, or Escape. Closing restores focus without resetting
the conversation or its draft.

Regression coverage: `server/tests/fluent-navigation-browser.cjs` checks
360px/390px layouts, hit testing over the chat panel, keyboard traversal,
Escape/backdrop closure, retained drafts, desktop resize, theme persistence,
and restoration of the classic theme.
