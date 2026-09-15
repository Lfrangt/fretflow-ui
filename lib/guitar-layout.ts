import type { DreamGuitar } from "./dream-guitars";

/** Phone focus keeps frets and labels at reading size; only this strip scrolls. */
export function mobileFocusLayout(guitar: DreamGuitar, width: number, height: number, frets: number) {
  const neckWidth = Math.max(width - 48, frets * 44);
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
  const neckWidth = 1080;
  const neckHeight = 150;
  const neckX = 32;
  const jointWidth = 22;
  const photoWidth = neckHeight * guitar.photoScale;
  const photoX = neckX + neckWidth + jointWidth - photoWidth * guitar.joinX;
  const photoY = 24;
  const neckY = photoY + photoWidth * guitar.centerY - neckHeight / 2;
  return { width: photoX + photoWidth + 32, height: photoWidth / guitar.aspect + 48,
    photoX, photoY, photoWidth, neckX, neckY, neckWidth, neckHeight, jointWidth, joined: true };
}
