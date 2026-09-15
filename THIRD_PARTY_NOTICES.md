# Third-party software and model provenance

Our application code is MIT licensed. Third-party components retain their own
licenses; this document does not relicense any dependency, model or dataset.

## ChordMini

- Source: https://github.com/ptnghia-j/ChordMini
- Pinned revision: `aa6e3a8d7b017f082fd2aaff9329d5c26af49c03`
- Model: `checkpoints/2e1d_model_best.pth` (ChordNet 2E1D, 170 classes).
- Code license: MIT, copyright 2026 ChordMini contributors.
- License copy: `licenses/ChordMini-MIT.txt`.
- The upstream source is downloaded unmodified by `scripts/setup.sh` and is not
  committed inside this application. Our adapter imports its feature extractor,
  checkpoint loader and sliding-window inference. The app adds silence handling,
  timestamp clamping and interpretation; it does not retrain the network.
- The checkpoint is fetched from the upstream repository and hash-checked.
  Upstream's source license does not grant rights to third-party training data.
  This application does not bundle those datasets. Before distributing model
  binaries, confirm the applicable model and upstream dependency terms separately.
- Paper: https://arxiv.org/abs/2602.19778

## Spotify Basic Pitch

- Source: https://github.com/spotify/basic-pitch
- Distribution: `basic-pitch==0.4.0`; ICASSP 2022 ONNX model bundled by upstream.
- License: Apache-2.0, copyright 2022 Spotify AB.
- Copies: `licenses/BasicPitch-LICENSE.txt`, `licenses/BasicPitch-NOTICE.txt`.
- Uses the official prediction pipeline with explicit ONNX CPU inference.
  Application thresholds and serialization are configurable. JSON retains pitch
  bend estimates; the app's MIDI export deliberately contains discrete pitches.

## alphaTab, notation font and soundfont

- alphaTab 1.8.4: https://github.com/CoderLine/alphaTab — MPL-2.0.
- Installed unmodified through npm. Our React adapter is separate application code.
- Copies: `licenses/alphaTab-MPL-2.0.txt` and `licenses/alphaTab-integrated-libraries.txt`.
- Bravura notation font: SIL Open Font License; the package's OFL and font notices are copied to `/alphatab/font/` with the fonts.
- The package's SONiVOX soundfont ships its own license and README, preserved in `/alphatab/soundfont/` during asset preparation.
- `scripts/prepare-notation.mjs` copies these assets and notices unmodified at build time. Do not remove the component/font/sample notices when redistributing.
- Source entry point is linked in the in-app alphaTab credit. No alphaTab source modifications are included here.

### Guitar-only playback samples

- Both score and detected-timing playback use the FreePats Spanish classical guitar, version 2019-06-18, recorded by Roberto from an actual guitar: https://freepats.zenvoid.org/Guitar/acoustic-guitar.html.
- License: CC0-1.0; full text in `licenses/FreePats-Classical-Guitar-CC0.txt`.
- `public/soundfonts/freepats-classical-guitar.sf2` contains only this guitar. Its sole preset was reassigned from program 0 to GM program 24; sample data is unchanged. Source and output hashes are recorded beside the asset in `freepats-classical-guitar.json`.
- SONiVOX is still copied as part of the unmodified alphaTab distribution, but these two players do not load it.

## Other dependencies

### Demucs (optional guitar separation)

- Source: https://github.com/facebookresearch/demucs — MIT, Meta Platforms, Inc. and affiliates. License copy: `licenses/Demucs-MIT.txt`.
- Pinned inference distribution: `demucs==4.0.1`; checkpoint `htdemucs_6s` / `5c90dfd2-34c22ccb.th`, downloaded from Meta's official distribution URL and SHA-256 checked in `models.lock.json`.
- The official six-source model adds guitar and piano to drums, bass, vocals and other. Upstream describes it as experimental and specifically notes piano bleed/artifacts. The original repository is archived; this adapter does not imply active upstream development.
- Third-party code is installed unmodified; our adapter handles verified loading, source selection, progress/cancellation, and output storage. The model is downloaded locally, not committed. No training data or third-party music is bundled.
- Requirements and transitive versions are recorded in `requirements.separation.lock.txt`. Model and dataset rights remain with their respective owners; software licensing does not relicense user audio.

React and Next.js (MIT), NumPy/SciPy/librosa (BSD family), PyTorch
(BSD-style), ONNX Runtime (MIT), FastAPI (MIT), and their transitive packages
remain subject to the licenses shipped in their respective distributions.
`package-lock.json` and `requirements.lock.txt` record installed versions.
FFmpeg is a separately installed system tool; the applicable build can be LGPL
or GPL depending on configuration. No FFmpeg binary is bundled here.

## Samples and user audio

`backend/demo.py` generates original deterministic synthesis for testing and is
part of the application's MIT source. No commercial music or third-party
recording is bundled. User recordings, outputs and caches under `.runtime/` are
excluded from version control and should never be included in a public release.

### Standard HTDemucs vocal removal

The additional `htdemucs` four-source checkpoint is fetched from Meta's official
Demucs distribution. Its URL and full SHA-256 are pinned as `demucs_vocals` in
`models.lock.json`. The code uses the same Demucs 4.0.1 MIT license retained in
`licenses/Demucs-MIT.txt`. Model files and user-derived audio are not committed.
Upstream: https://github.com/facebookresearch/demucs
