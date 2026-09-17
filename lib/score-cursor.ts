import type { midi } from "@coderline/alphatab";

export function findScoreCursorBeat(cache: midi.MidiTickLookup | null, tracks: Iterable<number>, tick: number) {
  const finalBar = cache?.masterBars.at(-1);
  if (!cache || !finalBar || !Number.isFinite(tick)) return null;
  // alphaTab rounds time-to-tick conversion up by one, while the lookup's
  // final bar has an exclusive end. Keep the final beat visible at that edge
  // without seeking or otherwise changing the player's authoritative clock.
  return cache.findBeat(new Set(tracks), Math.min(tick, finalBar.end - 1));
}
