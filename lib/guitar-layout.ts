import type { DreamGuitar } from "./dream-guitars";

/** Right-handed player view: nut on the left, high e above low E (as in TAB). */
export const rightHandedStringPosition = (string: number) => (string - 1) / 5;

/** Keep a stable fret origin; the phone camera moves, not the fret grid. */
export const PRACTICE_FRET_COUNT = 21;

/** Equal temperament: the 12th fret divides the vibrating string in half. */
export const fretDistance = (fret: number) => 1 - 2 ** (-Math.max(0, fret) / 12);

/** Follow the photographed string taper instead of applying the teaching grid's width. */
export function photoMarkerPosition(guitar: DreamGuitar, string: number, fret: number) {
  const distance = fret > 0 ? (fretDistance(fret - 1) + fretDistance(fret)) / 2 : 0;
  const lane = rightHandedStringPosition(string);
  const axes = guitar.photoStrings;
  const top = axes ? axes.nut[0] + (axes.bridge[0] - axes.nut[0]) * distance : guitar.centerY - .4 / guitar.photoScale;
  const bottom = axes ? axes.nut[1] + (axes.bridge[1] - axes.nut[1]) * distance : guitar.centerY + .4 / guitar.photoScale;
  return { x: guitar.nutX + distance * guitar.scaleLength, y: (top + (bottom - top) * lane) * guitar.aspect };
}

/** Cell edges and centre, normalised to the visible length of the full neck. */
export function fretCell(fret: number, fretCount = PRACTICE_FRET_COUNT) {
  const end = Math.min(fretCount, Math.max(1, fret));
  const length = fretDistance(fretCount);
  const start = fretDistance(end - 1) / length;
  const right = fretDistance(end) / length;
  return { start, end: right, width: right - start, center: (start + right) / 2 };
}

export type FretWindow = { first: number; last: number };

/** Keep nearby chords in the same shot; move only when they reach its edges. */
export function fretboardWindow(frets: number[], previous: FretWindow, fretCount = PRACTICE_FRET_COUNT): FretWindow {
  if (!frets.length) return previous;
  // An open string is shown beside the visible window; it must not pull a high
  // position all the way back to the nut.
  const stopped = frets.filter(fret => fret > 0);
  const low = stopped.length ? Math.max(1, Math.min(...stopped)) : 1;
  const high = stopped.length ? Math.min(fretCount, Math.max(...stopped)) : 1;
  if (low >= previous.first + (previous.first === 1 ? 0 : 1)
    && high <= previous.last - (previous.last === fretCount ? 0 : 1)) return previous;
  const count = Math.min(fretCount, Math.max(8, high - low + 3));
  const first = Math.max(1, Math.min(fretCount - count + 1, Math.floor((low + high - count + 1) / 2)));
  return { first, last: first + count - 1 };
}

/** A local Focus view of the same continuous neck, with a joined fading body. */
export function focusGuitarLayout(guitar: DreamGuitar, width: number, height: number, window: FretWindow, fretCount = PRACTICE_FRET_COUNT) {
  const start = fretCell(window.first, fretCount).start;
  const end = fretCell(window.last, fretCount).end;
  const padding = Math.min(56, width * .055);
  const aperture = Math.max(1, width - padding * 2);
  // Calibrate once against ten middle frets. A new hand position only pans
  // this physical neck; fitting each window independently stretched every fret.
  const referenceSpan = fretCell(Math.min(14, fretCount), fretCount).end - fretCell(Math.min(5, fretCount), fretCount).start;
  const gridWidth = aperture / referenceSpan;
  const offset = Math.max(0, Math.min(gridWidth - aperture, (start + end) * gridWidth / 2 - aperture / 2));
  const neckWidth = gridWidth + 14;
  const neckHeight = Math.max(140, Math.min(260, height * .48));
  const neckX = 40;
  const neckY = 72;
  const photoWidth = neckHeight * guitar.photoScale;
  return { width: neckWidth + 80, height: neckHeight + 144,
    photoX: neckX + neckWidth + 22 - photoWidth * guitar.joinX,
    photoY: neckY + neckHeight / 2 - photoWidth * guitar.centerY, photoWidth,
    neckX, neckY, neckWidth, neckHeight, jointWidth: 22, joined: true,
    cameraX: padding - neckX - 14 - offset,
    openX: 14 + offset - 28 };
}

/** The selected photograph's own headstock, cropped at its calibrated nut.
 * Match its six string lanes to the teaching neck without deforming the photo.
 */
export function headstockLayout(guitar: DreamGuitar, neckHeight: number) {
  const top = guitar.photoStrings?.nut[0] ?? guitar.centerY - .4 / guitar.photoScale;
  const bottom = guitar.photoStrings?.nut[1] ?? guitar.centerY + .4 / guitar.photoScale;
  const photoWidth = neckHeight * .8 / (bottom - top);
  return { width: photoWidth * guitar.nutX, photoWidth, photoY: neckHeight * .1 - photoWidth * top };
}

/** Leave neighbouring frets around the shape and hold still inside that safe area. */
export function fretboardScrollTarget({ frets, gridWidth, fretCount, gridX, viewportWidth, contentWidth, scrollLeft }: {
  frets: number[]; gridWidth: number; fretCount: number; gridX: number;
  viewportWidth: number; contentWidth: number; scrollLeft: number;
}) {
  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  const current = Math.max(0, Math.min(maxScroll, scrollLeft));
  if (!frets.length || viewportWidth <= 0) return current;
  const first = fretCell(Math.min(...frets), fretCount);
  const last = fretCell(Math.max(...frets), fretCount);
  const left = gridX + first.center * gridWidth;
  const right = gridX + last.center * gridWidth;
  const padding = Math.min(first.width * gridWidth, viewportWidth * .15);
  if (left >= current + padding && right <= current + viewportWidth - padding) return current;
  return Math.max(0, Math.min(maxScroll, (left + right - viewportWidth) / 2));
}

/** Phone focus keeps frets and labels at reading size; only this strip scrolls. */
export function mobileFocusLayout(guitar: DreamGuitar, width: number, height: number, frets: number) {
  // Even the narrowest high fret must fit a 28px note badge.
  const neckWidth = Math.max(width - 48, 14 + 30 / fretCell(frets, frets).width);
  const neckHeight = Math.max(112, Math.min(216, height - 52));
  const neckX = 32;
  const neckY = 32;
  const photoWidth = neckHeight * guitar.photoScale;
  return { width: neckWidth + 48, height: neckHeight + 52,
    photoX: neckX + neckWidth + 22 - photoWidth * guitar.joinX,
    photoY: neckY + neckHeight / 2 - photoWidth * guitar.centerY, photoWidth,
    neckX, neckY, neckWidth, neckHeight, jointWidth: 0, joined: false };
}

/** Shared scene coordinates keep the photograph and strings aligned while fitting the viewport. */
export function guitarLayout(guitar: DreamGuitar, focused: boolean, compact: boolean, focusMode = false) {
  if (focusMode) {
    const neckHeight = compact ? 260 : 180;
    const neckWidth = compact ? 552 : 1080;
    const neckX = compact ? 24 : 40;
    const neckY = 80;
    const photoWidth = neckHeight * guitar.photoScale;
    return { width: neckWidth + neckX * 2, height: compact ? 420 : 340,
      photoX: neckX + neckWidth + 22 - photoWidth * guitar.joinX,
      photoY: neckY + neckHeight / 2 - photoWidth * guitar.centerY, photoWidth,
      neckX, neckY, neckWidth, neckHeight, jointWidth: 22, joined: !compact };
  }
  if (!focused) {
    const photoWidth = 1500;
    return { width: 1564, height: photoWidth / guitar.aspect + 48,
      photoX: 32, photoY: 24, photoWidth,
      neckX: 32 + photoWidth * guitar.nutX,
      neckY: 24 + photoWidth * guitar.centerY - photoWidth / guitar.photoScale / 2,
      neckWidth: photoWidth * guitar.scaleLength / 2, neckHeight: photoWidth / guitar.photoScale, jointWidth: 0, joined: false };
  }
  if (compact) {
    const photoWidth = 540;
    return { width: 600, height: 370 + photoWidth / guitar.aspect + 24,
      photoX: 30, photoY: 370, photoWidth,
      neckX: 24, neckY: 64, neckWidth: 552, neckHeight: 220, jointWidth: 0, joined: false };
  }
  const neckWidth = 1580;
  const neckHeight = 180;
  const neckX = 32 + headstockLayout(guitar, neckHeight).width;
  const jointWidth = 22;
  const photoWidth = neckHeight * guitar.photoScale;
  const photoX = neckX + neckWidth + jointWidth - photoWidth * guitar.joinX;
  const photoY = 24;
  const neckY = photoY + photoWidth * guitar.centerY - neckHeight / 2;
  return { width: photoX + photoWidth + 32, height: photoWidth / guitar.aspect + 48,
    photoX, photoY, photoWidth, neckX, neckY, neckWidth, neckHeight, jointWidth, joined: true };
}
