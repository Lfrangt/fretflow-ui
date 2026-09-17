# Finger movement during chord changes

Both the web and native practice stages model a suggested hand movement. This
is an animation of the chosen fingering, not motion captured from a recording.
The interval colors and labels retain their existing meaning.

A numbered finger keeps its identity when changing strings. Unchanged contacts
stay planted; a barre can have multiple contact points belonging to the same
finger. Contact matching reserves the unchanged points before assigning moving
ones. A different finger at the same location releases and replaces the contact.
Open strings and source diagrams with unspecified fingers do not invent a
physical finger identity. Detected-note playback remains immediate.

A move releases pressure, lifts slightly toward the interior of the neck, travels
on an arc, rolls and presses down. Cross-string moves lift more than same-string
moves. Fingers land in a restrained sequence; all phases, including staggering,
fit in at most 480 ms and within 38% of a playing chord's duration. Audio timing
is unchanged. Fast retargets start from the displayed position. Labels remain
upright and share the dot's position; photo labels stay above other dots.

Reduced motion applies the final position directly. Initial display, camera
movement, guitar changes and resizing do not create artificial chord changes.
Focus camera and neck geometry are separate from the finger movement.

## Verification

`tests/finger-motion.test.mjs` checks identity, barres, anchors, open/unspecified
contacts, release, roll, interruption continuity and the timing budget.
`verification/finger-motion-*.json` contains observed browser frame data; PNGs
and the web clip show actual rendered output. Native implementation and simulator
verification are recorded in the current task handoff; web checks alone do not
establish native parity or an App Store release.
