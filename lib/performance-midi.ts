import type { DetectedNote } from "./transcription";

type Engine = typeof import("@coderline/alphatab");
export const PERFORMANCE_TICKS_PER_SECOND = 1920; // Fixed MIDI clock, independent of playback speed.
const TICKS_PER_SECOND = PERFORMANCE_TICKS_PER_SECOND;

/** The performance clock is independent of notation tempo, meter and fingering. */
export function buildPerformanceMidi(engine: Engine, notes: DetectedNote[], duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid performance duration");
  const file = new engine.midi.MidiFile();
  file.division = 960;
  const handler = new engine.midi.AlphaSynthMidiFileHandler(file, true);
  handler.addTempo(0, 120);
  const channels = Array.from({ length: 16 }, (_, channel) => channel).filter(channel => channel !== 9);
  const active = channels.map(() => new Map<number, number>());
  const initialized = new Set<number>();
  for (const note of notes.filter(n => !n.excluded).toSorted((a, b) => a.start - b.start || a.midi - b.midi)) {
    if (![note.start, note.end, note.midi].every(Number.isFinite) || !Number.isInteger(note.midi) ||
        note.midi < 0 || note.midi > 127 || note.start < 0 || note.end <= note.start || note.start >= duration) {
      throw new Error("Invalid note in performance timeline");
    }
    const start = Math.round(note.start * TICKS_PER_SECOND);
    const end = Math.max(start + 1, Math.round(Math.min(note.end, duration) * TICKS_PER_SECOND));
    // MIDI note-off affects its key/channel. Separate overlapping repetitions
    // so one note ending cannot silence another equal pitch still ringing.
    const slot = active.findIndex(keys => (keys.get(note.midi) ?? -1) <= start);
    if (slot < 0) throw new Error("Too many overlapping repetitions of the same pitch");
    const channel = channels[slot];
    if (!initialized.has(channel)) {
      handler.addProgramChange(0, 0, channel, 24);
      handler.addControlChange(0, 0, channel, engine.midi.ControllerType.VolumeCoarse, 100);
      handler.addControlChange(0, 0, channel, engine.midi.ControllerType.PanCoarse, 64);
      initialized.add(channel);
    }
    // Activation is not calibrated playing intensity. Only use explicit MIDI
    // velocity when supplied; otherwise retain a declared neutral constant.
    const velocity = Number.isFinite(note.velocity) ? Math.max(1, Math.min(127, Math.round(note.velocity!))) : 95;
    handler.addNote(0, start, end - start, note.midi, velocity, channel);
    active[slot].set(note.midi, end);
  }
  handler.finishTrack(0, Math.round(duration * TICKS_PER_SECOND));
  return file;
}
