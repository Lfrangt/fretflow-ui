# Existing scores and fingering practice

Implemented in the current FretFlow app and included in the public pilot.
See [maintenance notes](MAINTENANCE-2026-09-15.md) for the latest release verification.

## Product flow

- **Import score** in the Chord Progression dock accepts chord-only text,
  ChordPro, MusicXML/MXL and Guitar Pro. Users preview the order, part, tempo
  and durations before applying the chart to the existing scrolling practice strip.
- Text bars divide the declared meter equally. Unbarred chords default to four
  quarter-note beats. These assumptions are disclosed; `C:2` gives an explicit
  two-beat duration. N.C. stays silent. Unsupported text repeats/transposition
  require explicit written chords. PDF/image recognition is not connected.
- Structured scores use explicit chord symbols, one selected staff and alphaTab's
  expanded playback order. A note-only score is rejected, not harmonized by guesswork.
  Chord labels sustain until the next symbol; unmarked passages/rests need review.
  Variable-tempo pieces use one adjustable practice tempo, retaining beat durations.
- Compatible written chord diagrams preserve their strings and frets, including
  high positions. Compatibility currently means six-string standard tuning without
  capo. Unavailable finger numbers stay blank. The source score itself is unchanged.

## Neck position and visual reference

- **Fingering & video** offers 0–5, 5–12 and 8–17 fret preferences. The preference
  is remembered in this browser. The default is 5–12; style names do not imply
  that every R&B or Neo-Soul passage must be played high on the neck.
- Compact seventh/ninth/extended chord suggestions preserve their represented
  chord tones. Extended comping shapes may omit the fifth. Slash basses remain
  exact; unsupported symbols do not turn into a fallback Am7.
- A sequence optimizer minimizes movement between neighboring chord candidates.
  Users can pin each occurrence independently. Source diagrams and explicit user
  choices take priority over range preferences. Reset restores the source diagram
  when available, otherwise connected suggestions.
- Reference video stays local to the browser: adjustable speed, 0.04-second seek
  steps, source-time offset and chord navigation support visual comparison.
  **There is no automatic visual fingering recognition.** Occluded fingers cannot
  be asserted as original fingerings. Text-chart/video timing must be aligned.
- Synthesized-note positions prefer the chosen range but preserve the actual
  MIDI pitch/octave and unique strings. Reachable pitches outside the preference
  remain playable; the fretboard can show positions above fret 12, up to fret 21.
  A chord rearrangement and an exact-pitch note placement are distinct operations.
- **Adjust score → Preferred fret range** applies the same 0–5, 5–12 or 8–17
  preference to generated TAB and MusicXML/Guitar Pro exports. The saved range
  carries into fretboard practice. It changes string/fret suggestions, not pitch;
  bass notes that cannot fit the range retain playable positions outside it.
- During synthesized-note playback, the ruler stays fixed at frets 1–21.
  Entering or fading bass notes therefore cannot resize the grid mid-phrase.

## Coordination and verification (2026-09-15)

Read the other tasks “恢复产品到之前版本效果” and “查找开源 Logic Pro 替代品”.
Their original/synthesized audio modes and reversible single/double-note review
remain separate. This task does not claim to fix their reported false notes or
release the experimental audio transcription engine. Staff/TAB remains Beta.

The reference inspected was the existing launch source clip plus the original
local performance video. It supports higher-position visual review, not a
claim that every string/finger was identified.

Checks: chord text validation, actual MusicXML repeats, actual GP export/reimport,
source diagrams, high-position chord tones/slash bass, sequence movement, exact
MIDI pitches/polyphony, existing playback and bilingual catalog tests. Browser
checks cover pasted and MusicXML imports, edited durations, language preservation,
per-step shape choice, video seek/speed and the existing scrolling practice UI.
These are software checks, not independent musician validation of transcription.

Verification result: 33 Node tests passed, TypeScript and production build passed.
The narrow-screen import overflow found during browser QA was fixed; the sheet
content width and scroll width both measured 234 CSS pixels. Evidence is saved
locally under `verification/score-import/checks.json` (ignored by Git).

The launch recapture integration additionally passed 17 Python score/API tests,
14 note/voicing/MIDI tests, 5 bilingual catalog tests and a production webpack
build including TypeScript. Browser checks at 1600×820, 1280×720 and 1000×650
verified saved high-position settings, practice handoff, fixed synthesized ruler,
pitch-correct markers and exclusive original/synthesized playback. These checks
do not establish that suggested fingerings match the source guitarist's fingers.
