# Focus transition

Restored on 2026-09-16 from the shared scene choreography in `1053206` (2026-09-15).

- Desktop practice shows the learning neck joined to the selected guitar body.
- The photograph and learning neck stay inside one `instrument-composition`. Entering Focus enlarges that scene and dissolves the body through opacity, 22px blur, saturation, brightness, a gradient mask and slight Y rotation. Exit reverses that transition.
- Scene duration is 1.2s with `[.22, 1, .36, 1]` easing. Material duration is 1.35s; opacity uses 1.2s. Reduced motion uses zero duration.
- Appearance's close fretboard view and the stage's Focus mode are separate states. Exiting Focus returns to the chosen appearance view.
- The body must remain rendered during the desktop transition. A camera class that hides it with `display:none`, or a separate fixed photo scene, changes the accepted motion.
- Keep current string orientation, realistic fret spacing, photo-marker calibration, and phone Focus scrolling. Phone normal mode displays the full guitar.

## Larger stage and position following (2026-09-16, afternoon)

At the user's request, desktop chord cards now place the diagram beside the chord name and use 90px rather than 160px of height. The freed height belongs to the guitar stage.

Desktop Focus uses a fixed physical scale calibrated against ten middle frets. The visible fret count varies naturally along a real neck. Changing the fingering or browsing only changes the camera position; it never refits or stretches the fret grid. Nearby shapes hold the same view, while crossing its safe edges smoothly moves to the new position. Open strings stay visible beside the window without pulling a high-position shape back to the nut. Empty steps hold the view.

Only entry/exit change the scene geometry, retaining the 1.2s scene and 1.35s material choreography above. Once entry finishes, position changes translate the shared scene (normally 580ms, shortened during playback). Wheel or arrow keys browse by fret; Home/End reach either end. The next fingering change resumes automatic framing. Phone Focus retains native horizontal scrolling.

The ordinary joined scene now includes the selected photograph's own headstock, cropped at its calibrated nut and aligned to all six teaching-string lanes. A longer teaching neck gives the body more room on the right; 80px desktop chord cards return another 10px to the stage. The headstock fades with the body during Focus and returns on exit. Whole-photo phone views keep the original full guitar.

The original Relic Strat uses `fender-guitar-cutout.png`, a true RGBA cutout at the original 2700×1040 coordinates. Its RGB pixels are unchanged; only the edge-connected neutral backdrop and baked shadow were removed from alpha. Both the whole-photo view and the joined body/headstock use this same asset, and the legacy headstock shares the body's 0.8 opacity. A rectangular crop or multiply blend alone is not background removal. Other guitar assets already contain transparency.

Verification covers intermediate entering/exiting states, high-position following, stable nearby shapes, manual browsing, Escape, retained chord selection, reduced motion, and phone overflow. Tests, TypeScript and the production build must pass before publication. Static screenshots of the two endpoints alone do not verify the transition.
