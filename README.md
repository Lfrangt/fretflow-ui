# FretFlow

FretFlow is an experimental guitar learning interface for advanced chord movement. It turns a progression into animated fretboard positions, keeps loop controls close to the instrument, and includes early import flows for chord text, chart OCR, and server-side MP3 chord recognition.

Live demo: https://fretflow-ui.vercel.app

## Features

- Animated high-position chord voicings on a focused fretboard
- Loop modes for full progression, A/B pair practice, and hold
- Interval-first labels such as `R`, `3`, `b7`, `9`, and `13`
- Roman-numeral degree labels reveal each chord's function in the key, so progressions are memorized as movement (ii → V → I), not as isolated shapes
- Built-in jazz, R&B, blues, and neo-soul practice progressions
- Custom marker palettes, guitar skins, and Web Audio tone presets
- Optional Liquid DOM glass layer with automatic WebGPU fallback
- Server route for MP3 chord recognition through Klangio or a self-hosted ChordMini worker

## Tech Stack

- Next.js App Router
- React
- Motion
- Web Audio API
- Liquid DOM

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Copy `.env.example` to `.env.local` when using MP3 chord recognition.

```bash
cp .env.example .env.local
```

Klangio mode:

```bash
CHORD_ENGINE_PROVIDER=klangio
KLANGIO_API_KEY=your_server_side_key
KLANGIO_API_URL=https://api.klang.io
```

ChordMini mode:

```bash
CHORD_ENGINE_PROVIDER=chordmini
CHORDMINI_API_URL=http://localhost:5001
```

API keys are server-only. Do not expose them to the browser.

## Assets

The repository keeps one main guitar reference image for the prototype experience. Additional skins use original SVG placeholder assets. If you add more product photography or branded instrument images, make sure you have the right to redistribute them before committing.

## Scripts

```bash
npm run dev
npm run build
npm run start
```

## License

MIT
