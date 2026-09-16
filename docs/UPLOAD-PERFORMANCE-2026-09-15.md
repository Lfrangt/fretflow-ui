# Upload performance verification — 2026-09-15

The public worker was healthy, but its live duration limit was 60 seconds. A
142.2-second video could be transferred in full before duration validation failed.
The worker now allows 180 seconds, matching the local default. The browser reads
the live limit and validates the selected duration before requesting an upload
ticket.

Supported videos now upload a lossless copy of their encoded audio track. The
original video remains available for local preview. Other formats retain the
existing upload path. The UI reports sent bytes, percentage and speed, separates
uploading from server processing, and supports cancellation and stalled-upload
timeouts without automatically replaying single-use tickets.

## Measurements

One 142.2-second H.264/AAC video was used throughout. These are individual measured
runs, not latency guarantees.

| Check | Result |
| --- | --- |
| Original video | 22,940,625 bytes |
| Extracted audio | 2,301,819 bytes; 89.97% smaller |
| Local extraction | 0.080 seconds |
| Audio preservation | Decoded stereo PCM was byte-identical; 44,100 Hz, 6,270,976 samples per channel |
| Paired cloud transfer probe, original video | 9.935 seconds |
| Paired cloud transfer probe, audio only | 1.655 seconds |
| Deployed browser request body, including multipart fields | 2,302,332 bytes |
| Deployed browser POST to accepted job response | 8.460 seconds, including network/CORS/server overhead |
| Deployed browser upload ticket request to completed-result response | 127.830 seconds, including vocal removal and analysis after a worker restart |
| Full-video result, both local and production | Done; 142.199 seconds; 130 chord segments |

The paired transfer probes returned HTTP 422 for an intentionally unsupported
analysis mode after receiving the file, so they measured transfer/request time
without running inference. The separate production browser test submitted the
original MP4 using the normal interface, received HTTP 202, and completed default
vocal removal plus chord analysis. Its cold-run timing should not be confused with
the smaller transfer-probe number. Chord counts prove completion, not accuracy.

## Validation and release

- `npm test`: 52 passing tests, including actual FFmpeg audio-preservation,
  duration rejection, fallback, cancellation, progress, HTTP errors and stalled
  upload coverage.
- `npm run typecheck`, `npm run build`, and `git diff --check`: passed.
- Local browser completed the real 142.2-second video and retained its result
  through English/Chinese switching.
- Production deployment `dpl_AMvjXfhhnz6mQPa9sJCyS1oUgnaw` was checked through
  authenticated Vercel access, promoted to `https://www.fretflow.io/`, and verified
  with the full browser upload above.
- The live public health endpoint reports `max_duration: 180`,
  `max_bytes: 99614720`, and all configured analysis engines available.

Vocal removal and transcription still take server compute time. Unsupported
video formats can fall back to their original size, and the current file picker
still enforces the advertised original-file size limit before preparation.
