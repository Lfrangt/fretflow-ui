import sources from "@/public/assets/dream-guitars/sources.json";

export type DreamGuitar = {
  id: string; model: string; finish: string; family: string; image: string;
  source?: string; maple: boolean; legacy?: boolean;
  // Photo coordinates in units of image width after a 180-degree rotation.
  // Rotation keeps the source guitar right-handed; a horizontal mirror does not.
  joinX: number; centerY: number; photoScale: number; nutX: number; scaleLength: number; aspect: number;
  // High-e / low-E axes, in image-width units, measured after the same rotation.
  photoStrings?: { nut: [number, number]; bridge: [number, number] };
};

// Each source has its own crop and string taper. Pixel measurements below are
// after rotation; scale length follows the photographed frets, before saddle
// compensation. Never substitute the teaching grid's width for a photo's axes.
const photoCalibration: Record<string, {
  height: number; nutX: number; scaleLength: number;
  nut: [number, number]; bridge: [number, number];
}> = {
  "strat-olympic-white": { height: 649, nutX: 381.4, scaleLength: 1312.1, nut: [284.2, 356.8], bridge: [273.1, 379.2] },
  "strat-surf-green": { height: 651, nutX: 381.6, scaleLength: 1312.2, nut: [290.4, 362.7], bridge: [272.4, 378.6] },
  "strat-dark-night": { height: 651, nutX: 381.5, scaleLength: 1310.4, nut: [292.5, 364.6], bridge: [274.1, 380.7] },
  "tele-aquatone-blue": { height: 656, nutX: 369.8, scaleLength: 1310.9, nut: [295, 368.5], bridge: [275.4, 384.6] },
  "tele-butterscotch": { height: 651, nutX: 374, scaleLength: 1312, nut: [292.9, 365.1], bridge: [273.3, 384.7] },
  "jazzmaster-coral-red": { height: 670, nutX: 370.7, scaleLength: 1234.3, nut: [300.5, 368.5], bridge: [283.6, 385.4] },
};

export const dreamGuitars: DreamGuitar[] = [
  { id: "relic-sunburst", model: "Relic Strat", finish: "Original sunburst", family: "Original", image: "/assets/fender-guitar-cutout.png", maple: false, legacy: true, joinX: .655, centerY: 1040 / 2700 - .218, photoScale: 15.3, nutX: .195, scaleLength: .65, aspect: 2700 / 1040,
    photoStrings: { nut: [403 / 2700, 497 / 2700], bridge: [377 / 2700, 523 / 2700] } },
  ...sources.map(source => {
    const jazzmaster = source.id.startsWith("jazzmaster");
    const telecaster = source.id.startsWith("tele");
    const photo = photoCalibration[source.id];
    return {
      id: source.id, model: source.model, finish: source.finish, family: jazzmaster ? "Jazzmaster" : telecaster ? "Telecaster" : "Stratocaster",
      image: source.file, source: source.sourcePage, maple: source.fingerboard === "Maple",
      joinX: jazzmaster ? .635 : .666, centerY: photo.height / 2000 - (jazzmaster ? .167 : .163),
      photoScale: jazzmaster ? 16.4 : 15.9, nutX: photo.nutX / 2000, scaleLength: photo.scaleLength / 2000, aspect: 2000 / photo.height,
      photoStrings: { nut: photo.nut.map(y => y / 2000) as [number, number], bridge: photo.bridge.map(y => y / 2000) as [number, number] }
    };
  })
];
