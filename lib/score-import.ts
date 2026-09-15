import type { GuitarMarker } from "./guitar-voicing";
import type { model } from "@coderline/alphatab";

type Engine = typeof import("@coderline/alphatab");
export type ChartStep = { chord: string; beats: number; section: string; bar?: number; sourceShape?: GuitarMarker[] };
export type ImportedChart = { title: string; steps: ChartStep[]; bpm: number; notices: string[]; source: "text" | "score" };
export const MAX_CHART_STEPS = 1000;

export function chartChord(value: string): string {
  const chord = value.trim().replaceAll("♭", "b").replaceAll("♯", "#").replaceAll("Δ", "maj").replaceAll("ø", "m7b5").replaceAll("°", "dim").replace(/[()]/g, "");
  if (/^(N\.?C\.?|N|rest)$/i.test(chord)) return "N.C.";
  // Only explicit chord symbols are read. Notes/lyrics never become inferred harmony.
  if (!/^[A-G][#b]?(?:(?:maj|min|dim|aug|sus|add|m|M)?\d*(?:maj\d+|sus[24]|add\d+|[#b]\d+|alt)*)(?:\/[A-G][#b]?)?$/.test(chord)) {
    throw new Error("Some text is not a chord symbol. Use chord-only lines or ChordPro brackets around chords.");
  }
  return chord.replace(/^([A-G][#b]?)min/, "$1m").replace(/^([A-G][#b]?)M/, "$1maj");
}

export function validateChart(chart: ImportedChart): ImportedChart {
  if (!chart.steps.length || !chart.steps.some(step => step.chord !== "N.C.")) throw new Error("No chord symbols were found. A melody or note-only score does not determine the harmony.");
  if (chart.steps.length > MAX_CHART_STEPS) throw new Error("This chart is too long. Import up to 1,000 chord steps at a time.");
  if (!Number.isFinite(chart.bpm) || chart.bpm < 30 || chart.bpm > 240) throw new Error("Choose a practice tempo between 30 and 240 BPM.");
  for (const step of chart.steps) {
    chartChord(step.chord);
    if (!Number.isFinite(step.beats) || step.beats <= 0 || step.beats > 256) throw new Error("Each chord needs a duration greater than 0 and no more than 256 quarter-note beats.");
  }
  return chart;
}

export function parseChordText(text: string, bpm = 72): ImportedChart {
  if (text.length > 200_000) throw new Error("This chart is too long. Import up to 1,000 chord steps at a time.");
  const chart: ImportedChart = { title: "Imported chord chart", steps: [], bpm, notices: [], source: "text" };
  let section = "", bar = 0, beatsPerBar = 4, assumed = false, explicitTempo = false;
  const chordPro = [...text.matchAll(/\[([^\]]+)\]/g)].some(match => { try { chartChord(match[1].split(":")[0]); return true; } catch { return false; } });
  for (let line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    line = line.replace(/\{([^}:]+)(?::([^}]*))?\}/g, (_, rawKey: string, rawValue = "") => {
      const key = rawKey.trim().toLowerCase(), value = rawValue.trim();
      if (["title", "t"].includes(key)) chart.title = value || chart.title;
      else if (key === "tempo") { chart.bpm = Number(value); explicitTempo = true; }
      else if (["time", "meter"].includes(key)) {
        const match = /^(\d+)\/(2|4|8|16)$/.exec(value);
        if (!match || Number(match[1]) < 1 || Number(match[1]) > 32) throw new Error("Use a time signature such as 4/4, 3/4 or 6/8.");
        beatsPerBar = Number(match[1]) * 4 / Number(match[2]);
      } else if (["start_of_chorus", "soc", "start_of_verse", "sov", "comment", "c"].includes(key)) section = value || (key.includes("chorus") || key === "soc" ? "Chorus" : "Verse");
      else if (["end_of_chorus", "eoc", "end_of_verse", "eov"].includes(key)) section = "";
      else if (!["artist", "subtitle", "st", "key", "k"].includes(key)) throw new Error("This ChordPro directive needs review. Expand repeats and transposition into written chords first.");
      return "";
    }).trim();
    if (!line) continue;
    const heading = /^\[(verse|chorus|intro|outro|bridge|interlude|主歌|副歌|前奏|尾奏|间奏)([^\]]*)\]$/i.exec(line);
    if (heading) { section = line.slice(1, -1); continue; }
    if (/:\||\|:|\bx\d+\b|\{/.test(line)) throw new Error("Expand repeat signs into the full playing order before importing text.");
    if (chordPro && !line.includes("[") && !line.includes("|") && !line.split(/\s+/).every(token => { try { chartChord(token.split(":")[0]); return true; } catch { return false; } })) continue;
    const measures = line.split("|").map(value => value.trim()).filter(Boolean);
    for (const measure of measures) {
      const bracketed = [...measure.matchAll(/\[([^\]]+)\]/g)].map(match => match[1]);
      const tokens = bracketed.length ? bracketed : measure.split(/[\s,]+/).filter(Boolean);
      const steps = tokens.map(token => {
        const [symbol, duration, ...extra] = token.split(":");
        if (extra.length || (duration !== undefined && (!Number.isFinite(Number(duration)) || Number(duration) <= 0 || Number(duration) > 256))) throw new Error("Each chord needs a duration greater than 0 and no more than 256 quarter-note beats.");
        return { chord: chartChord(symbol), beats: duration === undefined ? 0 : Number(duration), section, bar: bar + 1 };
      });
      if (!steps.length) continue;
      const explicit = steps.filter(step => step.beats !== 0).length;
      if (explicit && explicit !== steps.length) throw new Error("Give every chord in a measure a duration, or leave all durations to review together.");
      if (!explicit) {
        assumed = true;
        for (const step of steps) step.beats = line.includes("|") ? beatsPerBar / steps.length : 4;
      }
      chart.steps.push(...steps); bar++;
    }
  }
  if (assumed) chart.notices.push("Text timing is a practice assumption: barred measures are divided equally; unbarred chords use four beats each. Review or edit every duration.");
  if (!explicitTempo) chart.notices.push("No tempo was supplied. The current practice tempo is used.");
  return validateChart(chart);
}

export function chordParts(score: model.Score) {
  return score.tracks.flatMap(track => track.staves.filter(staff => staff.bars.some(bar => bar.voices.some(voice => voice.beats.some(beat => beat.chord?.name)))).map(staff => ({
    id: `${track.index}:${staff.index}`, name: `${track.name || `Track ${track.index + 1}`} · ${staff.index + 1}`, staff
  })));
}

export function parseScoreChords(engine: Engine, score: model.Score, partId: string): ImportedChart {
  const part = chordParts(score).find(part => part.id === partId);
  if (!part) throw new Error("No chord symbols were found. A melody or note-only score does not determine the harmony.");
  if (score.masterBars.length > MAX_CHART_STEPS) throw new Error("This chart is too long. Import up to 1,000 chord steps at a time.");
  const midi = new engine.midi.MidiFile();
  const generator = new engine.midi.MidiFileGenerator(score, null, new engine.midi.AlphaSynthMidiFileHandler(midi, false));
  // Bound actual expanded bars, including nested repeats, while preserving
  // normal sequential repeats. Do not multiply unrelated repeat sections.
  const addMasterBar = generator.tickLookup.addMasterBar.bind(generator.tickLookup);
  generator.tickLookup.addMasterBar = bar => {
    if (generator.tickLookup.masterBars.length >= MAX_CHART_STEPS * 4) throw new Error("This chart is too long. Import up to 1,000 chord steps at a time.");
    addMasterBar(bar);
  };
  generator.generate();
  const played = generator.tickLookup.masterBars;
  const chart: ImportedChart = { title: score.title || "Imported chord chart", steps: [], bpm: score.tempo, notices: [], source: "score" };
  const events: { start: number; chord: string; section: string; bar: number; sourceShape?: GuitarMarker[] }[] = [];
  let section = "";
  // alphaTab's playback timeline expands repeats and alternate endings. Selecting
  // one staff prevents conflicting chord labels in other parts from being mixed.
  for (const playedBar of played) {
    const master = playedBar.masterBar;
    if (master.section?.text) section = master.section.text;
    const bar = part.staff.bars[master.index];
    if (!bar) throw new Error("The selected part has missing measures. Please repair the score before importing.");
    const simultaneous = new Map<number, { chord: string; sourceShape?: GuitarMarker[] }>();
    for (const voice of bar.voices) for (const beat of voice.beats) {
      if (!beat.chord?.name) continue;
      const chord = chartChord(beat.chord.name.replaceAll("\u00a0", " "));
      const tick = playedBar.start + beat.playbackStart;
      if (simultaneous.has(tick) && simultaneous.get(tick)?.chord !== chord) throw new Error("Conflicting chord symbols occur at the same time. Choose another part or correct the source score.");
      const written = beat.chord.strings;
      const standard = part.staff.capo === 0 && part.staff.stringTuning.tunings.join(",") === "64,59,55,50,45,40";
      const sourceShape = standard && written.length === 6 && written.every(fret => Number.isInteger(fret) && fret >= -1 && fret <= 21) && written.some(fret => fret >= 0)
        ? written.flatMap((fret, i) => fret < 0 ? [] : [{ string: i + 1, fret, interval: ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][([64,59,55,50,45,40][i] + fret) % 12], finger: 0 }]) : undefined;
      const earlier = simultaneous.get(tick);
      if (earlier?.sourceShape && sourceShape && earlier.sourceShape.map(m => `${m.string}:${m.fret}`).join() !== sourceShape.map(m => `${m.string}:${m.fret}`).join()) throw new Error("Conflicting chord diagrams occur at the same time. Choose another part or correct the source score.");
      simultaneous.set(tick, { chord, sourceShape: sourceShape ?? earlier?.sourceShape });
    }
    for (const [start, value] of [...simultaneous].sort((a, b) => a[0] - b[0])) events.push({ start, ...value, section, bar: master.index + 1 });
    if (events.length > MAX_CHART_STEPS || played.length > MAX_CHART_STEPS * 4) throw new Error("This chart is too long. Import up to 1,000 chord steps at a time.");
  }
  if (events.length && events[0].start > played[0].start) {
    events.unshift({ start: played[0].start, chord: "N.C.", section: "", bar: 1 });
    chart.notices.push("The opening has no chord symbol. It is kept as a silent practice step, not assigned a guessed chord.");
  }
  const end = played.at(-1)?.end ?? 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    chart.steps.push({ chord: event.chord, section: event.section, bar: event.bar, sourceShape: event.sourceShape, beats: ((events[i + 1]?.start ?? end) - event.start) / 960 });
  }
  if (chart.steps.some(step => step.sourceShape)) chart.notices.push("Written chord diagrams are preserved for standard tuning without capo. Finger numbers are not inferred from the diagram.");
  else chart.notices.push("No compatible chord diagrams were found. Fretboard shapes will be suggested for standard tuning without capo.");
  chart.notices.push("Chord symbols follow the score's playback order, including repeats. Each chord continues until the next symbol; review unmarked passages and rests.");
  if (new Set(played.flatMap(bar => bar.tempoChanges.map(change => change.tempo))).size > 1) chart.notices.push("The source changes tempo. Practice uses one adjustable tempo while preserving chord durations in beats.");
  return validateChart(chart);
}
