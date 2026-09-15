# Original recording practice

Imported practice now defaults to **Original recording**, explicitly distinct from synthesized **Detected notes · Beta** and **Chord practice**. The source audio is never presented as a synthesized reconstruction.

`use-practice-recording.ts` uses the local analysis audio endpoint and the media element's actual `currentTime`. The same score offset and detected chord boundaries drive seeking, the chord guide, full progression, adjacent-pair and single-chord loops. Playback rate preserves pitch. Opening the source dialog, pausing or switching audio modes stops practice. Residual oscillator previews are stopped on transport changes. An unavailable local recording shows an explicit error and allows selecting another mode; there is no silent fallback to a different audio source.

`practice-performance.ts` retains the original URL and score offset and defines loop ranges. The existing MIDI-tick player remains available as an estimated-note audition. Its note timing is preserved, but recognition and synthesis fidelity are not fixed by adding original-recording practice. The displayed shapes are suggested chord voicings, not recovered original fingering or a note-by-note animation.

Validation for the launch source (local analysis `0af1ed89ec15439fb924250d8faae197`):

- 13 Node checks cover imported timing, source offset and loop boundaries, MIDI output, and i18n; TypeScript passes.
- Playwright verified source play/pause, chord seeking, mutually exclusive mode switching, and opening the source dialog during playback, with and without the recording apparatus. An expired-source check also verified the visible error, disabled source playback, and an explicit switch to working chord practice.
- A new recording contains only the original-media source in the play-along and A/B audition windows. Guide changes followed the source clock at full and reduced speed (maximum measured transition delay below 90 ms in that run).
- Evidence and reproducible capture scripts: local verification artifacts (not included in the repository).

These checks establish transport behavior, not note/chord ground truth or production transcription quality. Local history audio expires; the user must reopen/import a source if it becomes unavailable.
