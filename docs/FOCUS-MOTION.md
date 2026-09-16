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

Desktop Focus frames about eight frets around the current fingering, expanding for unusually wide shapes. The full neck keeps its original fret numbers and realistic spacing; only the visible window moves. Nearby shapes hold the same view, while crossing its safe edges smoothly moves to the new position. Open strings stay visible beside the window without pulling a high-position shape back to the nut. Empty steps hold the view.

The window changes the shared scene's geometry, so the guitar body stays joined while dissolving. Entry/exit retain the 1.2s scene and 1.35s material choreography above. Once entry finishes, position changes use the same easing and timing as the fingering movement (normally 580ms, shortened during playback). Wheel or arrow keys browse by fret; Home/End reach either end. The next fingering change resumes automatic framing. Phone Focus retains native horizontal scrolling.

Verification covers intermediate entering/exiting states, high-position following, stable nearby shapes, manual browsing, Escape, retained chord selection, reduced motion, and phone overflow. Tests, TypeScript and the production build must pass before publication. Static screenshots of the two endpoints alone do not verify the transition.
