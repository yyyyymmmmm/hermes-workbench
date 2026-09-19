# Clear Glass Theme

Settings > Appearance > Clear glass enables this optional web theme. Existing
preferences and the classic first-run default are preserved.

Research references:
- https://github.com/stormaref/LiquidGlassSkill (community skill, MIT)
- https://github.com/kevinbism/liquid-glass-effect (CSS example, MIT)

The reviewed `liquid-glass` skill is installed locally for development, not on
users' Hermes servers. No repository setup or demo scripts were executed.
The stylesheet is implemented in `web/glass.css`. `web/liquid-glass.js` ports
the skill's refraction field from Angular to plain JavaScript, retaining its
MIT notice (upstream dashersw/liquid-glass-js, copyright Armagan Amcalar).
No Angular runtime, remote images or page-snapshot library is bundled.

Reference: https://liquidglassdesign.com/ and its guide distinguish ordinary
frosted glass from lens refraction and responsive highlights. This revision
adds actual edge-displacement maps, while keeping reading surfaces legible.
It is a web approximation, not native Apple Liquid Glass.

Motion responds to interaction: cards lift on pointer hover, buttons depress
on activation, and the existing drawer/dialog transitions remain in use.
Pointer movement changes control reflection angles without tilting text.
At most six visible controls receive shared, size-keyed SVG filters; repeated
cards use the lightweight CSS tier. Maps rebuild on resize, not every frame.
Theme exit removes active observers, listeners and filters. No continuous
animation, decorative blobs or particles are used. Reduced motion disables
reactive reflections and movement. Reduced transparency and forced colors
disable the refraction engine. Chromium supports SVG backdrop refraction;
Safari/iOS retain CSS frosting because parsing a filter does not prove support.

Tests cover theme persistence, hover transforms, motion opt-out, mobile
navigation stacking, 360px/390px layouts, and switching back to other themes.
Tests also compare filtered/unfiltered pixels and verify bounded filters and
cleanup. Shared assets are bundled for mobile; no native rebuild is claimed.
Real-device GPU performance and iOS WebKit rendering remain device checks.
