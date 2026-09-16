# Grok Box processing and downloadable scores — 2026-09-15

The existing Grok Box worker in `/workspace/fretflow-worker` now runs the updated
engine. The public web interface was deployed and promoted as
`dpl_82DacaMVxYmKMyefcuGg7apU34fc` at https://www.fretflow.io/.
The verified worker archive SHA-256 is
`68d755a0d1abe9e4f9ba8b159cd04763cba60a3ea6d9e607766b381020f08a7e`.
Existing code was backed up before extraction; the empty queue was checked before
the supervisor restart. Live health confirms eight model threads and loaded
ChordMini, Basic Pitch and vocal-removal models.

## CPU comparison

The same first 24 seconds of the user's recording were processed on the Grok
Box, using the existing pinned Demucs model and identical inference settings.
The machine has eight vCPUs and an eight-CPU cgroup quota. No GPU was detected.

| CPU threads | Demucs seconds |
| --- | ---: |
| 2, first pass | 18.833 |
| 4 | 11.139 |
| 8 | 7.500 |
| 1 | 30.906 |
| 2, repeat | 17.680 |

Eight threads reduced this sample's separation time by 58–60% against the two
baseline runs. Maximum absolute output difference was 0.0000023842; checkpoints,
quality settings and source content were unchanged. These are individual local
comparisons on this machine, not latency guarantees. The cloud launcher defaults
to eight; the runtime bounds thread counts to actual CPU capacity. ONNX inference
also uses an explicit thread budget, and onset/tempo analysis shares its envelope.
Installed models load before queued inference rather than waiting for an upload.

Reanalysis with the same separation mode copies completed stems to an independent
new draft. It retains ownership checks, expiry independence and the original
source offset. Changed modes and missing stems use normal separation. A local
142.199-second reanalysis completed in 8.839 seconds, with 130 chord segments and
589 note candidates. Candidate counts establish completion, not accuracy.

## Full recording on the updated public worker

A fresh upload of the same 142.199-second audio completed with default vocal
removal and chord analysis. It did not reuse stems. An immediate reanalysis
requested both chords and notes and reused the completed separation:

| Measurement | Seconds |
| --- | ---: |
| Upload/request to accepted fresh job | 1.080 |
| Fresh separation | 45.130 |
| Fresh chord analysis | 10.020 |
| Fresh total worker processing | 55.472 |
| Fresh request through completed response, including polling | 57.967 |
| Reanalysis worker processing, chords + notes | 11.530 |
| Reanalysis request through completed response, including polling | 13.157 |

The prior deployed recording's separation took 102.860 seconds; this updated
run reduced that stage by 56%. The old total browser flow (127.830 seconds) and
this authenticated API run have different transport/polling overhead, so the
stage comparison is the appropriate direct comparison. The fresh result kept
130 chord segments; reanalysis produced 589 note candidates. Test admissions
used a dedicated internal QA owner and obeyed the normal two-job daily quota.
Live browser reanalysis and downloads were verified separately through the
normal signed browser session.

## Exports

The result panel directly downloads four PDF layouts: chord chart, staff + guitar
tabs, staff only, and tabs only. It also downloads Guitar Pro, MusicXML, note MIDI,
chord-guide MIDI, chord TXT and chord CSV. Browser-side PDF and Guitar Pro work is
loaded on demand. Server file downloads use fetch plus a Blob download, including
hosted download-ticket redirects, and show errors on failure.

The real 142.199-second result was exported through the interface. The Chinese
PDFs contain 6, 14, 7 and 6 pages respectively; first pages and end-page pagination
were rendered and visually inspected. Whole staff systems remain together.
Guitar Pro was re-imported with alphaTab (one guitar track, 77 bars); MusicXML
parsed successfully with 77 bars. Note MIDI parsed with 589 notes, chord MIDI
with 347 notes. Chord CSV has 130 data rows. The notation contains 1,647 written
note entries including tied/quantized notes, which is distinct from 589 detections.
Notation exports retain their Beta/reference notices. A local copy of the complete
export pack is in `output/FretFlow-export-pack.zip`; output files are excluded
from Git and deployment inputs.

The production browser successfully reanalyzed its prior recording and downloaded
MusicXML and staff + tabs PDF through the promoted site. Model and user content
are never included in the worker source archive.

## Checks

- `npm test`: 54 passed.
- `npm run test:audio`: 60 passed.
- Production build, TypeScript and `git diff --check`: passed.
- Coverage includes CPU bounds, optional model preload isolation, independent
  cached-stem copies, missing-stem fallback and whole-system PDF pagination.
- Upload preservation and timing evidence is in
  [UPLOAD-PERFORMANCE-2026-09-15.md](UPLOAD-PERFORMANCE-2026-09-15.md).

The current tunnel and Grok Box must remain available for public analysis. This
release does not turn an ephemeral machine or tunnel into persistent hosting.
