import type { CSSProperties } from "react";

export type IconName = "play" | "pause" | "previous" | "next" | "edit" | "close" | "back" | "settings" | "chevron" | "loop" | "sound" | "muted" | "appearance" | "key" | "import" | "library" | "check" | "focus" | "collapse";

const paths: Record<IconName, string> = {
  play: "m9 5 11 7-11 7Z",
  pause: "M9 5v14M16 5v14",
  previous: "M6 5v14m13-14L8 12l11 7Z",
  next: "M18 5v14M5 5l11 7-11 7Z",
  edit: "m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z",
  close: "m6 6 12 12M6 18 18 6",
  back: "m14 5-7 7 7 7M7 12h13",
  settings: "M4 7h16M4 17h16M9 4v6m6 4v6",
  chevron: "m9 5 7 7-7 7",
  loop: "M20 8H7a4 4 0 0 0-4 4m17-4-4-4m4 4-4 4M4 16h13a4 4 0 0 0 4-4M4 16l4 4m-4-4 4-4",
  sound: "M4 9v6h4l5 4V5L8 9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14",
  muted: "M4 9v6h4l5 4V5L8 9Zm13 1 5 5m-5 0 5-5",
  appearance: "M12 3a9 9 0 1 0 0 18c2 0 3-1 2-3s1-3 3-3h1c5 0 4-12-6-12ZM7 9h.01M11 6h.01M16 8h.01M6 14h.01",
  key: "M8 4v16m8-16v16M4 10l16-4M4 18l16-4",
  import: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  library: "M4 4v16M9 4v16m5-15 6 14",
  check: "m5 12 4 4L19 6",
  focus: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"
};

export function WorkspaceIcon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={name === "play" ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
    <path d={paths[name]} />
  </svg>;
}
