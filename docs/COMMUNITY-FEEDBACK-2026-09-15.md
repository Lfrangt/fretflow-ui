# Community feedback: chord positions, two guitars and tone

## Click positions to find a chord

Open **Find a chord** from the fingering controls or settings. Pick one fret (or mute) per string, including open strings, and move the window up to fret 21. Matching uses the selected pitch classes; ambiguous names and omitted fifths are shown. Audition plays the selected shape. Adding a match keeps the existing progression and pins the selected positions without claiming they came from an imported score.

## Two guitar parts

In a completed note analysis, select notes and assign them to **Guitar 1** or **Guitar 2**. Assignments persist through revisions. Score generation keeps the parts separate, including simultaneous notes and overlapping sustain; the score selector also limits playback to the selected part. MIDI, MusicXML and Guitar Pro exports retain both instrument tracks.

The worker advertises `features.note_tracks`; an older worker disables assignments until updated. Unassigned/legacy notes stay in Guitar 1. This is manual note organisation, not automatic separation of two guitars from a mixed recording. Shared detected chord symbols appear on the first part only.

## Tone starting points

Open **Tone starting points** in sound settings or an analysis result. Four authored presets offer 0–10 gain, bass, middle, treble, delay mix and reverb mix settings. Adjustments are saved in this browser. The short synthesized phrase demonstrates control differences; it is not a guitar or amp simulation. Changing a control stops the preview, and original-audio/notation playback stops tone audition.

The control explanations draw on the [BOSS Katana setup guide](https://articles.boss.info/out-of-box-setup-tips-for-your-boss-katana/). Preset values are FretFlow starting suggestions, not BOSS patches. We do not infer equipment or original knob positions from a recording; automatic timbre analysis remains unimplemented.

## Verification scope

Frontend tests cover exact/ambiguous chord naming and invalid shapes. Backend tests cover atomic track edits, revision conflicts, old-client compatibility and MIDI/MusicXML track separation. A synthetic two-part MusicXML → Guitar Pro → reload check preserves both parts and their pitches. Browser checks use synthetic QA audio/notes, not a claim about transcription accuracy or real-device iPhone audio.

Validation: 60 frontend tests and 65 backend tests passed, along with production build and TypeScript checks. Browser checks covered a 390 × 844 CSS viewport without horizontal overflow, high-position C (`x x 10 9 8 8`) added with its positions intact, English/Chinese switching, saved tone settings, slider/preset changes, mutual pause between tone and notation audition, manual note assignment and single-part score display. Changes are local; this work did not deploy the site or worker.
