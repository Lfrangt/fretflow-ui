export type Finish = {
  id: string;
  name: string;
  body: string;
  /** Slightly darker companion used for the body rim/back so the finish reads as lacquer, not flat plastic. */
  shadow: string;
  pickguard: string;
};

export const finishes: Finish[] = [
  { id: "moonstone", name: "Moonstone", body: "#E8E3D8", shadow: "#CFC8B9", pickguard: "#F7F4ED" },
  { id: "graphite", name: "Graphite", body: "#2B2B2E", shadow: "#1B1B1E", pickguard: "#3A3A3E" },
  { id: "pacific", name: "Pacific", body: "#39596E", shadow: "#2A4456", pickguard: "#E9E5DA" },
  { id: "terracotta", name: "Terracotta", body: "#B3563E", shadow: "#8F4231", pickguard: "#EFE8DC" },
  { id: "sage", name: "Sage", body: "#8A9B84", shadow: "#6F7F6A", pickguard: "#F1EEE4" },
  { id: "sunburst", name: "Sunburst", body: "#7A4A26", shadow: "#3D2413", pickguard: "#E9DFC8" }
];

export const defaultFinish = finishes[2];

export type MarkerColors = Record<"root" | "third" | "fifth" | "seventh" | "extension", string>;

export const markerColors: MarkerColors = {
  root: "#D6A23E",
  third: "#5E9268",
  fifth: "#4E7FAE",
  seventh: "#C16A58",
  extension: "#8B76B4"
};
