# FretFlow

**From a clip to your next riff. 从喜欢的片段，到下一次练习。**

FretFlow is an open-source guitar practice app with a bilingual fretboard, editable chord progressions, audio/video analysis, and score import. Try it at [fretflow.io](https://www.fretflow.io).

This repository includes the current web app, the separately hosted Python analysis worker, tests, model setup scripts and deployment templates. Notes, rhythm and fingering estimates remain reviewable **Beta** drafts, not a verified transcription of the original performance.

## What you can do

- Practice chord progressions with animated interval labels, Roman numerals and connected voicings.
- Edit chords, choose a fret range, pin fingerings, slow playback and loop a progression or pair of chords.
- Use the mobile layout and Focus mode; switch English / 中文 without clearing your work.
- Import text, ChordPro, MusicXML/MXL or Guitar Pro chord symbols for practice.
- Analyze an uploaded video/audio clip with ChordMini and Basic Pitch; optionally remove vocals or isolate guitar with Demucs.
- Review and edit results, compare original and simulated playback, and export chord charts, MIDI, MusicXML or Guitar Pro files.

## Run the web app

Use **Node.js 22.18 or newer** and npm. Node.js 24 is recommended.

```sh
git clone https://github.com/Lfrangt/fretflow-ui.git
cd fretflow-ui
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Chord practice and score import work without a model worker or paid API key. Video/audio analysis requires the separate worker below. Build hooks prepare the alphaTab assets automatically.

## Run audio/video analysis locally

Install Python 3.11, [uv](https://docs.astral.sh/uv/) and FFmpeg (including ffprobe), then:

```sh
npm run setup:audio
npm run setup:vocals
# Optional: six-stem guitar isolation
npm run setup:separation
# Terminal 1
npm run worker
# Terminal 2
npm run dev
```

The web app connects to `http://127.0.0.1:8771` in development. Setup downloads pinned third-party code/models and checks model hashes; these downloads are not part of the Git repository. The default transcription preparation removes vocals. Choose **Original audio** if you have only installed the base models.

See [transcription setup and limits](docs/MEDIA-TRANSCRIPTION.md). The older `/api/analyze-audio` route can optionally use Klangio or a separate ChordMini API; its provider settings are in `.env.example`. The current `/api/transcription` worker does not require those paid-provider settings.

## Hosted deployment

Deploy the Next.js frontend and the Python worker separately. Production has no fallback to a local worker. Configure these server-side values on the appropriate services:

| Variable | Purpose |
| --- | --- |
| `FRETFLOW_WORKER_URL` | Worker URL used by the frontend server |
| `FRETFLOW_WORKER_TOKEN` | Matching private secret on frontend and worker |
| `FRETFLOW_HOSTED=1` | Enable signed browser-session ownership and quotas on both services |
| `FRETFLOW_ALLOWED_ORIGINS` | Allowed frontend origins on the worker |

See [hosted configuration](docs/HOSTING-500-US.md) and [VPS templates](ops/vps/README.md). Browser sessions are isolated; account login and cross-device history are not implemented. Run your own worker for a fork rather than pointing it at the public demo's private service.

Vercel Web Analytics can be enabled separately in your project dashboard. Operational analysis logs use `scripts/summarize-analysis.mjs`; they cover only jobs observed in the supplied log window. See the [September maintenance notes](docs/MAINTENANCE-2026-09-15.md).

## Checks

```sh
npm test
npm run build
npm run typecheck
# After setting up the Python environment and FFmpeg:
npm run test:audio
```

An optional [GitHub Actions template](docs/frontend-ci.yml.example) runs these frontend checks on Node.js 24. Copy it to `.github/workflows/ci.yml` using a credential with workflow-write permission to enable it; it is not active yet.

Build before the standalone type check in a fresh checkout so Next.js generates route types. Real model smoke checks and dataset benchmarks are documented separately; unit tests do not establish transcription accuracy on arbitrary music.

## Assets and licenses

Application code is [MIT licensed](LICENSE). Third-party software, fonts, soundfonts, models and photographs retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The guitar soundfont is included with its license and provenance. Model weights, datasets, user recordings, outputs, credentials and local verification captures are excluded. Extra Fender reference photos in the optional Dream Guitar picker are not bundled; the default guitar asset remains available. Sources/calibration are versioned, and `scripts/fetch-dream-guitars.py` can retrieve the references for local review. An unconfigured optional photo choice may show no photo. No redistribution license for Fender photography has been verified; these photos are not covered by MIT.

## Contribute / 一起共建

欢迎反馈练琴时遇到的问题，也欢迎改进移动端、无障碍体验、翻译、指型和音频分析。

- [Report a bug or suggest a feature](https://github.com/Lfrangt/fretflow-ui/issues).
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
- For audio issues, include your device/browser and reproduction steps. Share only recordings you have permission to publish; keep private media out of public issues.

Further guides: [score import and fingering](docs/SCORE-IMPORT-FINGERING.md), [practice playback](docs/PRACTICE-PERFORMANCE.md), [mobile behavior](docs/MOBILE-PRACTICE.md), [transcription quality](docs/TRANSCRIPTION-QUALITY.md).
