/** Contact points are not fingers: a barre has several contacts with one finger. */
export type FingerContact = { string: number; fret: number; finger: number; interval: string; midi?: number };
export type FingerTrack = { id: number; marker: FingerContact; entering: boolean };
export type FingerTracks = { tracks: FingerTrack[]; nextId: number };
const knownFinger = (m: FingerContact) => m.fret > 0 && m.finger >= 1 && m.finger <= 4;
export const sameContact = (a: FingerContact, b: FingerContact) => a.string === b.string && a.fret === b.fret && a.finger === b.finger;

export function reconcileFingers(previous: FingerTracks, markers: FingerContact[], initial = false): FingerTracks {
  const available = new Set(previous.tracks.map((_, i) => i));
  const matches = new Map<number, number>();
  // Reserve every unchanged contact before assigning moving fingers. In a barre,
  // a new endpoint must never steal another endpoint that is still held down.
  markers.forEach((marker, i) => {
    const match = [...available].find(j => sameContact(previous.tracks[j].marker, marker));
    if (match !== undefined) { matches.set(i, match); available.delete(match); }
  });
  const candidates: { target: number; source: number; cost: number }[] = [];
  markers.forEach((marker, target) => {
    if (matches.has(target) || !knownFinger(marker)) return;
    available.forEach(source => {
      const old = previous.tracks[source].marker;
      if (knownFinger(old) && old.finger === marker.finger) candidates.push({ target, source,
        cost: Math.abs(old.string - marker.string) * 4 + Math.abs(old.fret - marker.fret) });
    });
  });
  candidates.sort((a, b) => a.cost - b.cost || a.target - b.target || a.source - b.source);
  for (const { target, source } of candidates) {
    if (!matches.has(target) && available.has(source)) { matches.set(target, source); available.delete(source); }
  }
  let nextId = previous.nextId;
  return { nextId: nextId + markers.filter((_, i) => !matches.has(i)).length,
    tracks: markers.map((marker, i) => ({ marker, id: matches.has(i) ? previous.tracks[matches.get(i)!].id : nextId++, entering: !initial && !matches.has(i) })) };
}

export type FingerPose = { x: number; y: number; lift: number; roll: number; scaleX: number; scaleY: number; pressure: number; opacity: number };
export const restingFinger = (x: number, y: number): FingerPose => ({ x, y, lift: 0, roll: 0, scaleX: 1, scaleY: 1, pressure: 1, opacity: 1 });
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const p = clamp(n); return p * p * (3 - 2 * p); };
const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** One shared budget includes finger staggering, so the last finger never trails
 * into the next chord. This is a teaching motion, not a detected performance. */
export function fingerMotionDuration(availableSeconds: number) {
  return Math.max(0, Math.min(.48, availableSeconds));
}

export function sampleFingerMotion(from: FingerPose, to: FingerPose, before: FingerContact | null, after: FingerContact, progress: number): FingerPose {
  const t = clamp(progress);
  if (t === 0) return { ...from };
  if (t === 1) return { ...to };
  const known = knownFinger(after);
  const anchored = before !== null && sameContact(before, after);
  if (anchored || !known) {
    const p = smooth(t);
    return Object.fromEntries(Object.keys(to).map(key => [key, mix(from[key as keyof FingerPose], to[key as keyof FingerPose], p)])) as FingerPose;
  }
  const stagger = (after.finger - 1) * .045;
  const p = clamp((t - stagger) / (1 - stagger));
  const travel = smooth((p - .13) / .68);
  const settle = smooth((p - .77) / .23);
  const release = smooth(p / .2);
  const arch = Math.sin(Math.PI * clamp((p - .08) / .84));
  const crossString = before !== null && before.string !== after.string;
  const distance = before ? Math.abs(after.fret - before.fret) : 0;
  const height = before ? crossString ? 9 : Math.min(6, 3 + distance * .55) : 6;
  // Lift toward the centre, keeping outer-string contacts within the neck clip.
  const inward = after.string <= 3 ? 1 : -1;
  const direction = before ? Math.sign(after.fret - before.fret || after.string - before.string) : 1;
  const roll = direction * (crossString ? 11 : 7) * arch;
  const squash = Math.sin(Math.PI * clamp((p - .8) / .2)) * .055;
  return {
    x: mix(from.x, to.x, travel), y: mix(from.y, to.y, travel),
    lift: from.lift * (1 - release) + inward * height * arch,
    roll: from.roll * (1 - release) + roll,
    scaleX: mix(from.scaleX, 1, release) + arch * .055 + squash,
    scaleY: mix(from.scaleY, 1, release) - arch * .07 - squash,
    pressure: mix(from.pressure, 1, settle) * (1 - arch * .72),
    opacity: mix(from.opacity, 1, release),
  };
}
