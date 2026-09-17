# Tone Studio

Open **Tone Studio** from the practice controls or **Settings → Tone Studio**. The analysis result also exposes the same settings. This replaces the standalone tone-reference preview with a shared, live amp/effects chain.

The studio is a graphite instrument surface within the existing light practice workspace. A darker header, light silver knobs and white labels separate the controls from the page and from light video backgrounds. Mint-teal arcs, selected amp tabs and On indicators show enabled states; inactive effects retain readable gray labels and values instead of fading the entire panel. Section headings use typography and a fine divider. Preset fields, keyboard focus, bypass, errors and saved-status text share the same scoped dark palette in both the settings sheet and analysis results.

Functional text is at least 11 px, with 12 px primary knob labels and 14 px values. On phones, buttons and select fields are at least 44 px high and effects use two columns. This replaces the earlier cream/olive Tone Studio after the user's September 17 contrast request; it does not change the light site theme, audio sources, audition timing or Focus.

## Controls

- Clean, Crunch and Lead amp characters; gain and master volume.
- Bass, middle, treble and presence; Open back and Stack cabinet filtering.
- Independently enabled booster, chorus, delay and reverb. Delay time is adjustable from 80–800 ms.
- Six built-in starting points, named local presets, reset, and bypass. Vertical dragging and keyboard arrows control the knobs.
- The audition phrase loops for adjustment; the practice panel also starts/pauses the current progression. Changes apply immediately without restarting playback.

Settings apply to chord practice, chord-finder audition, synthesized imported notes, detected-timing playback and score playback. Source audio/video is unchanged. These are FretFlow's own browser effects; they do not reproduce BOSS circuitry, operate a connected Katana, or identify settings from recordings. The displayed signal chain has a fixed order.

## Persistence and audio

`lib/tone-rig.ts` owns the persistent Web Audio graph. `lib/tone-store.ts` shares changes across mounted outputs and saves settings plus up to 24 named presets under `fretflow-tone-rig-v1`. Saving an existing name updates that preset. Valid former 0–10 tone-guide values migrate to the new 0–100 scale. Presets stay in this browser and are not account-synced.

`lib/tone-synth.ts` implements alphaTab's public `ISynthOutput` and uses its official `AlphaSynth` with the existing guitar soundfont. It schedules stereo PCM through the rig, reports time from the audio clock, retains unread samples on pause, and clears queued audio/effect tails on seek. Synthesis runs on the main thread with roughly 120 ms of buffered audio, rather than alphaTab's default worklet output; slower mobile devices still need real-device listening checks.

Master volume also applies in bypass; zero mutes. Parameter changes are smoothed, delay feedback is bounded, and an output limiter/sample ceiling protects against extreme knob combinations. Audio starts only after browser gesture activation. Disposing an output stops modulation and disconnects its graph.

## Verification

- Unit tests cover input normalization, presets, graph reuse/cleanup, parameter smoothing, bounded feedback, legacy migration, local persistence, shared live updates, blocked storage, and cross-tab updates.
- The synth adapter tests use the shipped alphaTab build and guitar soundfont to exercise note timing, pause/resume, seeking, loop resets, and activation errors.
- Browser OfflineAudioContext rendering verifies gain, low/high EQ response, delay/reverb tails, master mute, bypass, live parameter changes and finite bounded output. Eight checks passed.
- Browser UI checks cover factory/custom presets, saved values after reload, language switching without reset, real progression playback, pointer and keyboard knob adjustments, 390 CSS-pixel layout, plus synthesized note and score playback using a synthetic two-guitar fixture.
- The temporary integration QA route is removed before production build. Browser emulation does not establish physical iPhone audio behavior or hardware-amp fidelity.
