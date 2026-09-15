# Imported performance playback

The notation-to-practice handoff now preserves detected notes separately from suggested chord voicings. The default for an import containing notes is **Detected notes**. **Settings → Sound → Chord practice** retains the five oscillator tone choices for practicing other arrangements.

`lib/practice-performance.ts` clips at the selected score offset while keeping note overlaps, rests, user exclusions and explicit velocities. `use-practice-performance.ts` uses the same guitar sound bank and MIDI builder as notation playback. Chord highlighting follows the real synth output rather than chained UI timers.

Speed and seeking use the fixed 1920 MIDI ticks per source second. alphaTab's `PositionChangedEventArgs.currentTime` changes with playback speed, so interpreting it as a source timestamp made slow practice drift. `currentTick` retains the source position. This also fixes the notation panel's detected-timing seek/display at slower speeds.

Pause retains the cursor; full / adjacent pair / hold ranges are sent to the synth. Imported pair loops at the last chord use the last adjacent pair. Closing the transcription dialog pauses original media and its synth players before returning to practice.

Validation: TypeScript and production build; seven MIDI/handoff tests; real Playwright upload/analysis/export/practice plus a full-tempo and 30 BPM capture. Timing evidence: local verification artifacts (not included in the repository).

Limits: these are still model estimates. Pitches, offsets, bends and original fingerings are not proven correct. The fretboard displays suggested chord shapes alongside detected-note audio, not a recovered fingering performance.

Reference: [alphaTab low-level player APIs](https://www.alphatab.net/docs/guides/lowlevel-apis/). Installed runtime: 1.8.4.
