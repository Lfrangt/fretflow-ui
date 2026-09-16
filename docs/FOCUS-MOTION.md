# Focus transition

Restored on 2026-09-16 from the shared scene choreography in `1053206` (2026-09-15).

- Desktop practice shows the learning neck joined to the selected guitar body.
- The photograph and learning neck stay inside one `instrument-composition`. Entering Focus enlarges that scene and dissolves the body through opacity, 22px blur, saturation, brightness, a gradient mask and slight Y rotation. Exit reverses that transition.
- Scene duration is 1.2s with `[.22, 1, .36, 1]` easing. Material duration is 1.35s; opacity uses 1.2s. Reduced motion uses zero duration.
- Appearance's close fretboard view and the stage's Focus mode are separate states. Exiting Focus returns to the chosen appearance view.
- The body must remain rendered during the desktop transition. A camera class that hides it with `display:none`, or a separate fixed photo scene, changes the accepted motion.
- Keep current string orientation, realistic fret spacing, photo-marker calibration, and phone Focus scrolling. Phone normal mode displays the full guitar.

Verification covers intermediate entering/exiting states, Escape, changing the guitar, retained chord selection, reduced motion, and phone overflow. Tests, TypeScript and the production build must pass before publication. Static screenshots of the two endpoints alone do not verify the transition.
