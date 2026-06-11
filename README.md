# FretFlow

FretFlow teaches advanced chord movement on the instrument itself. Design a guitar, pick a progression, and watch the voicings glide across a real-time 3D fretboard — every marker labeled by interval, every transition animated like choreography.

Live demo: https://fretflow-ui.vercel.app

## How it flows

1. **Intro** — a studio-lit 3D guitar floating in white space.
2. **Customize** — choose a finish (Moonstone, Graphite, Pacific, Terracotta, Sage, Sunburst) and a progression: built-in jazz / neo-soul / blues presets, or type your own.
3. **Stage** — one continuous camera move dives into the fretboard. Chords play in time, markers glide between voicings, and a glass transport dock controls tempo, stepping, and sound.

The whole app is a single uninterrupted camera shot — no page transitions, just three poses of the same scene.

## Features

- Procedurally modeled electric guitar in Three.js: real fret spacing (12-TET), gauged strings, inlays, studio lightformer reflections
- 26 advanced voicings (maj9, 13, alt, dim7, m11…) with interval-first markers: `R`, `3`, `b7`, `9`, `13`
- Markers animate between chords with critically-damped springs — you see the hand shape *move*
- Web Audio strum engine (no samples, pure synthesis)
- Keyboard transport: `Space` play/pause, `←` `→` step chords
- Server route for MP3 chord recognition through Klangio or a self-hosted ChordMini worker

## Tech Stack

- Next.js App Router + React
- Three.js via @react-three/fiber + drei
- Motion for DOM transitions
- Web Audio API

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

## License

MIT
