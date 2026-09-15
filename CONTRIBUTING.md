# Contributing / 参与共建

Welcome! Bug reports, practice feedback, translations, accessibility improvements,
mobile fixes and audio research are all useful contributions.

## Start locally

Use Node.js 22.18+ (24 recommended), then `npm ci` and `npm run dev`.
The normal fretboard works without model downloads. For worker changes, follow
[the audio setup guide](docs/MEDIA-TRANSCRIPTION.md); Python 3.11 and FFmpeg are required.

Before opening a pull request:

```sh
npm test
npm run build
npm run typecheck
# For Python changes, after audio setup:
npm run test:audio
```

The optional [CI template](docs/frontend-ci.yml.example) runs the first three checks
on Node.js 24. It is not enabled yet. Python/model verification is separate; include
the relevant commands and results in a worker pull request.

## Useful bug reports

Include the device, OS, browser/version, steps to reproduce, expected behavior and
actual behavior. For mobile audio, distinguish no output from muted sound, paused
playback or analysis failure. Desktop viewport emulation does not prove iPhone
speaker output. Screenshots and recordings are optional; remove private details.

## Product conventions

- Keep English and Chinese copy in `lib/i18n/messages.ts`; use complete phrases
  and named placeholders. Preserve musical symbols and user-authored content.
- Preserve the user's progression and playback position across settings/language
  changes. Only the chord strip should scroll when the current chord changes.
- Transcription is a reviewable draft. Keep uncertainty and Beta notices in the
  interface and exports. Report dataset, pitch/onset/offset metrics and limitations
  when proposing accuracy improvements.
- Never commit credentials, private audio, model weights, datasets or runtime
  output. Add license/provenance information for any distributable new assets.

Keep pull requests focused. Explain the user-visible result, how you verified it,
and any remaining limits. You do not need to publish a deployment to contribute.

欢迎用中文提交 issue 或 PR。描述具体练习场景，比只写“不能用”更容易复现和修复。
