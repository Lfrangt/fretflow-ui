export const TRANSCRIPTION_API = "/api/transcription";
export type AnalysisMode = "chords" | "both" | "notes";
export const NOTATION_BETA_NOTICE = "Staff notation and guitar tabs are in Beta. Notes, rhythms and fingerings may be inaccurate and are for reference only. We are working to improve accuracy; note-for-note reproduction is not guaranteed.";
export type Stem = "guitar" | "vocals" | "drums" | "bass" | "piano" | "other" | "instrumental";
export type Separation = { enabled: boolean; mode?: "none" | "guitar" | "instrumental"; model?: string; stems: Stem[]; notes_source: "original" | "guitar" | "instrumental"; chords_source: "original" | "instrumental" };

export type DetectedNote = {
  start: number; end: number; midi: number; name: string; activation: number;
  velocity?: number;
  excluded?: boolean; edited?: boolean; added?: boolean;
};
export type DetectedChord = {
  start: number; end: number; raw: string; label: string; root: number | null;
  roman: string; function: string; edited: boolean; review: boolean;
};
export type ScoreSettings = { bpm: number; meter: "3/4" | "4/4"; offset: number; capo: number; tuning: "standard" | "drop-d"; fret_min?: number; fret_max?: number };
export type Transcription = {
  mode?: AnalysisMode;
  id: string; name: string; revision: number; duration: number; clip_start: number;
  chords: DetectedChord[]; notes: DetectedNote[];
  key: { label: string; root: number | null; mode: "major" | "minor" | null; ambiguous?: boolean };
  tempo?: { bpm: number | null; estimated: boolean };
  score_settings: ScoreSettings; warnings: string[];
  separation?: Separation;
  parent_id?: string | null;
};
export type ScoreDraft = { musicxml: string; notices: string[]; assigned_count: number; omitted_indices: number[]; bar_count: number };
export type Job = { id: string; status: string; progress: number; stage: string; error?: string; result: Transcription | null };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  let url = TRANSCRIPTION_API + path;
  if (path === "/analyze" && init?.body instanceof FormData) {
    const grant = await api<{ direct: boolean; url?: string; ticket?: string; max_bytes?: number; max_duration?: number }>("/upload-ticket", { method: "POST" });
    if (grant.direct && grant.url && grant.ticket) {
      const file = init.body.get("file");
      if (file instanceof File && file.size > (grant.max_bytes ?? Infinity)) throw new Error("File exceeds the server upload limit. Please trim it first.");
      // The gateway is the only source of the signed destination and capability.
      url = grant.url;
      init = { ...init, credentials: "omit", headers: { "X-FretFlow-Ticket": grant.ticket } };
    }
  }
  try { response = await fetch(url, { cache: "no-store", ...init }); }
  catch { throw new Error("Unable to connect to the analysis service. Please try again."); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Request failed. Check your input and try again."); }
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed. Check your input and try again.");
  return data as T;
}

export function seconds(value: number) {
  return `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, "0")}`;
}
