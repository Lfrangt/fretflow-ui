import sources from "@/public/assets/dream-guitars/sources.json";

export type DreamGuitar = {
  id: string; model: string; finish: string; family: string; image: string;
  source?: string; maple: boolean; legacy?: boolean;
  // Photo coordinates as fractions of its horizontal width, after mirroring.
  joinX: number; centerY: number; photoScale: number; nutX: number; scaleLength: number; aspect: number;
};

export const dreamGuitars: DreamGuitar[] = [
  { id: "relic-sunburst", model: "Relic Strat", finish: "Original sunburst", family: "Original", image: "/assets/fender-guitar-clean.png", maple: false, legacy: true, joinX: .655, centerY: .218, photoScale: 15.3, nutX: .195, scaleLength: .65, aspect: 2700 / 1040 },
  ...sources.map(source => {
    const jazzmaster = source.id.startsWith("jazzmaster");
    const telecaster = source.id.startsWith("tele");
    return {
      id: source.id, model: source.model, finish: source.finish, family: jazzmaster ? "Jazzmaster" : telecaster ? "Telecaster" : "Stratocaster",
      image: source.file, source: source.sourcePage, maple: source.fingerboard === "Maple",
      joinX: jazzmaster ? .635 : .666, centerY: jazzmaster ? .167 : .163,
      photoScale: jazzmaster ? 16.4 : 15.9, nutX: .182, scaleLength: jazzmaster ? .627 : .68, aspect: jazzmaster ? 2000 / 670 : 2000 / 650
    };
  })
];
