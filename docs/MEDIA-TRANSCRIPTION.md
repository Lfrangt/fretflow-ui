# Video → chord chart, with optional Beta notation

This feature is integrated into the current FretFlow practice UI. Open **Video / audio** in the header, or **Edit → Import → Import video / audio**. It does not replace the guitar stage, appearance controls or progression editor.

## Local setup

Requires Node.js, Python 3.11, `uv`, FFmpeg and ffprobe.

```sh
npm ci
npm run setup:audio
npm run setup:vocals
# Optional six-stem guitar isolation (53 MiB model download)
npm run setup:separation
# Terminal 1
npm run worker
# Terminal 2
npm run dev
```

Development Next.js routes forward `/api/transcription/*` to `http://127.0.0.1:8771`. For an explicit server address, use the server-only `FRETFLOW_WORKER_URL` variable. An optional `FRETFLOW_WORKER_TOKEN` must have the same value in Next.js and the Python process; it is never sent to the browser.

The model setup fetches the pinned ChordMini source and checkpoint and installs Spotify Basic Pitch. `models.lock.json` and `scripts/check_models.py` check the model versions and SHA-256 hashes. These are real local inference engines, with no paid API key required. Initial imports/model startup can take longer than subsequent jobs.

## Workflow

1. Import a saved video (MP4, MOV, M4V, MKV, AVI, WebM, MPEG, MPG, 3GP) or audio (MP3, WAV, M4A, AAC, OGG, FLAC, AIFF, AIF). The codec must be supported by the installed FFmpeg build. Extension/MIME alone is not considered proof of readable audio.
2. Optionally select the start and end in seconds. Local defaults allow 200 MiB uploads and clips up to 180 seconds. Hosted limits are configurable; the public pilot uses 95 MiB and 180 seconds. Longer files require selecting a shorter clip. Before uploading, the browser checks the known duration and copies a supported video's encoded audio into an audio-only MP4, preserving its source timeline without re-encoding. Unsupported inputs retain the original upload path. Uploads show actual byte progress and can be cancelled; stalled requests time out without replaying their single-use ticket. The original mode extracts mono PCM at 22,050 Hz; vocal removal and guitar isolation preserve stereo PCM at 44,100 Hz before separation. Intermediate MP3 compression is unnecessary. The selected original audio can also be downloaded as MP3.
3. **Chord chart · recommended** is the initial output, in the UI and API. It focuses on harmony and change timing for players who want their own voicings, picking patterns and fills. The browser saves the selected output mode. Staff notation/tabs, alone or alongside chords, require choosing a **Beta** option; the melody demo explicitly opts into Beta notes. Jobs are queued, polled and cancellable between processing stages. Invalid files and videos without audio fail visibly; canned practice chords are never substituted.
4. Replay the source, slow playback, or loop a chord/note. Correct chord labels and key; edit note pitches/timing, remove false detections, and add missed notes.
5. Review tempo, meter, first-beat offset, tuning and capo. Generate a sixteenth-note rhythm draft with rests, chords and ties. Fingering is a bounded heuristic, not visual recognition of the performer's hand. Out-of-range/unplaceable notes are reported and remain in the raw note data.
6. **Export your analysis** downloads PDFs directly: a timed chord chart, staff + guitar tabs, staff only, or tabs only. PDF generation runs on demand in the browser and keeps staff systems together across pages. The same panel downloads Guitar Pro `.gp`, MusicXML, note MIDI, chord TXT/CSV and chord-guide MIDI. Note layouts and editable notation require a Beta note result. MusicXML and Guitar Pro use the current corrected score; MIDI retains detected/edited note timing. alphaTab also provides score playback and printing.
7. Send the detected progression to the existing FretFlow fretboard. This is chord practice at the chosen tempo, not a claim to reproduce the recording's timing or original guitar voicings. The transcription view preserves recording timing and harmony labels.

Chord results include a playing suggestion and a readable `.txt` chart with clip-relative times, harmony labels and review status. No bar lines, meter or original arrangement are invented for this chart. The CSV also retains review status. Model estimates and edited labels remain unverified; unclear segments stay marked for listening review. Reanalysis uses the selected output and preparation modes in a new draft, preserving the previous result.

Both staff notation and tablature carry the visible notice: **Notes, rhythms and fingerings may be inaccurate; for reference only. We are working to improve accuracy and cannot guarantee note-for-note reproduction.** The MusicXML title/metadata, alphaTab print/PDF subtitle, Guitar Pro subtitle/instructions and note MIDI track name retain Beta/reference markings. The full notice remains in MusicXML metadata and Guitar Pro instructions/notices. These labels also apply to historical note results and manually edited drafts.

The worker keeps local results for 24 hours. Source uploads are removed after extraction. Runtime audio, model downloads and temporary data are ignored by Git. There is no share-link scraper or automatic Douyin download in this version.

## Why these notation tools

| Tool | Role | Decision |
| --- | --- | --- |
| [alphaTab](https://github.com/CoderLine/alphaTab) | Embeddable standard notation, guitar tablature, playback, Guitar Pro export | Use inside FretFlow; pinned to 1.8.4, MPL-2.0 |
| [MuseScore Studio](https://handbook.musescore.org/file-management/working-with-musicxml-files) | Full score editing, layout, parts and printing | MusicXML handoff for human review and final layout |
| [Guitar Pro](https://www.guitar-pro.com/fr/docs/gp8/import-export/export) | Dedicated guitar notation editor | `.gp` and MusicXML handoff; users can continue with their installed editor |
| [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) | MusicXML rendering | Suitable alternative; alphaTab's integrated guitar/playback/export flow fits this feature better |

Do not automate a desktop scorewriter as a mandatory step for every web upload. A structured score interchange format gives the user a portable, editable result and lets a mature engine handle engraving. No MuseScore or Guitar Pro installation/license is needed for the in-app flow.

## Accuracy boundary

- ChordMini 2E1D has 170 labels (14 qualities × 12 roots plus N/X). It does not automatically provide 9th/11th/13th chords or inversions here.
- Basic Pitch is most useful for relatively clear single-instrument recordings. The optional **Isolate guitar · full mix (Beta)** mode uses Demucs `htdemucs_6s` before note transcription. Only notes use the guitar stem; harmony, key and tempo retain the full mix as context. The six-source model is experimental: weak guitar notes may disappear and other instruments may leak through. It does not distinguish two guitar players or guarantee improved transcription accuracy.
- Tempo is an estimate; 4/4 is an editable initial assumption. No automatic meter/downbeat detection, swing/tuplets or performance-technique notation is promised.
- The same guitar pitch may have several string/fret positions. Suggested fingering is not the original fingering, and audio-only analysis cannot establish which string the player used.
- Scores are reviewable drafts. Synthetic fixtures prove the connection and specific cases, not real-video transcription accuracy. Real user recordings have not yet been benchmarked.

## Checks

```sh
npm run build
npm run typecheck
npm run test:audio
.venv-audio/bin/python scripts/check_models.py
.venv-audio/bin/python scripts/verify_models.py
.venv-audio/bin/python scripts/verify_separation.py
```

Unit/integration tests exercise actual FFmpeg video extraction, clipping, missing audio, invalid inputs, cancellation, revision conflicts, note corrections, MIDI/MusicXML exports, guitar tuning/capo, bar duration accounting and ties. `verify_models.py` runs both neural models on original synthesized fixtures and checks C–Am–F–G, a nine-note melody and silence.

## Hosting boundary

The public pilot uses a separately hosted model worker. Production intentionally has no default worker URL; forks must configure their own service. `FRETFLOW_HOSTED=1` enables signed browser-session ownership and expiring upload/download tickets. Large media bypasses the Vercel function body. See [hosted configuration](HOSTING-500-US.md).

Local development without hosted mode is intended for one trusted operator. Do not expose that mode as a public shared service. Hosted browser sessions are not account login or cross-device identity. Keep models and audio processing off the short-lived web rendering process.

See `THIRD_PARTY_NOTICES.md` for component, font, soundfont and model provenance.

## Optional guitar separation

`npm run setup:separation` installs pinned Demucs 4.0.1 and torchaudio 2.9.1 with the existing torch 2.9.1 environment. It downloads a fixed upstream checkpoint and checks its full SHA-256 from `models.lock.json`. Restart the worker after setup. Upload jobs never download models; missing or invalid models fail visibly, without silently analyzing the original instead.

Demucs runs locally on CPU in seven-second overlapping chunks, with cancellation checks between chunks. Guitar, vocals, drums, bass, piano and other instruments are saved as stereo float WAVs with the original clip duration and common time origin. They are not individually normalized or silence-trimmed. The result player switches source at the same timestamp and playback speed; each stem can be downloaded. Saved results include model/source metadata and older records remain compatible. Stem files share the existing 24-hour job lifecycle.

`verify_separation.py` runs real Demucs, ChordMini and Basic Pitch inference on original synthesis, checking finite six-stem outputs, stereo channels, timing, and the note-input connection. This is a functional smoke check; it does not establish separation quality on real music or superiority to Logic Pro.

## Vocal removal before transcription

The default preparation in the import UI is **Remove vocals · keep accompaniment**.
`npm run setup:vocals` installs the same pinned Demucs dependencies and downloads
standard four-source `htdemucs` with a full SHA-256 check. Inference stays local.
Both ChordMini and Basic Pitch receive the accompaniment (drums + bass + other),
so vocals are removed before chord, key, tempo, and note analysis. Original audio
is retained separately from the stems. No MP3 encoding happens before inference.
Use **Original audio** for clean solo guitar; six-source **Isolate guitar** remains
an optional experimental mode with its separate guitar-only note input.

The result player switches between original, accompaniment, and vocals at the
same position and speed. Each stem can be downloaded as WAV. **Remove vocals and
transcribe again** creates a new job from an existing record's original audio;
previous edits and source clip offsets are preserved. Historical mono recordings
can be reprocessed, but the UI explains that re-uploading the original preserves
more detail. Records and stem files expire together after 24 hours.

`tests/test_vocal_removal.py` checks source routing, stereo preservation, stem
availability, reanalysis isolation/offsets, cached-stem copying and failure behavior. The controlled
80-note synthetic guitar + speech fixture improved onset/pitch F1 from .691 to
.920 after removal (80 ms onset tolerance, no offset matching). This is evidence
for that fixture only, not an accuracy estimate for real singing or mixed bands.
User audio was also processed locally, without a reference score or a claim of
improved accuracy. No-vocals accompaniment is not isolated guitar and may contain
separation artifacts, bass, piano, or drums.

## Processing performance

The cloud launcher preloads installed models on the single inference executor.
Torch and ONNX use `FRETFLOW_MODEL_THREADS`, bounded by CPU affinity, the cgroup
quota and a maximum of eight threads. The generic runtime defaults to two;
`scripts/run-cloud.sh` defaults to eight after measurement on the eight-vCPU
Grok Box. Override it in the private `.runtime/hosted.env` for other hardware.
`FRETFLOW_WARM_MODELS=0` disables preloading. Missing optional models do not prevent
the other models from warming.

Reanalyzing a completed recording with the same separation mode copies its
completed stems into the new draft and skips separation. The new draft remains
independent of the parent's expiry. Missing stems, a changed mode or historical
mono input fall back to preparation. This reuse is restricted to the existing
owner-checked reanalysis path. Output records include preparation and total
processing times and whether stems were reused.
