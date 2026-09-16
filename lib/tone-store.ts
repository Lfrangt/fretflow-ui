import { createToneRig, DEFAULT_TONE_RIG, normalizeToneRig, type ToneRigSettings } from "./tone-rig";

export type UserTonePreset = { id: string; name: string; settings: ToneRigSettings };
type ToneSnapshot = { settings: ToneRigSettings; presets: UserTonePreset[] };
const STORAGE_KEY = "fretflow-tone-rig-v1";
const initial: ToneSnapshot = { settings: DEFAULT_TONE_RIG, presets: [] };
let snapshot = initial;
let initialized = false;
const listeners = new Set<() => void>();
const rigs = new Set<ReturnType<typeof createToneRig>>();

function decode(value: unknown): ToneSnapshot | null {
  if (!value || typeof value !== "object" || !("settings" in value)) return null;
  const data = value as { settings: unknown; presets?: unknown };
  const seen = new Set<string>();
  const presets: UserTonePreset[] = [];
  if (Array.isArray(data.presets)) for (const item of data.presets.slice(0, 24)) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim() || seen.has(item.id)) continue;
    seen.add(item.id);
    presets.push({ id: item.id.slice(0, 80), name: item.name.trim().slice(0, 48), settings: normalizeToneRig(item.settings) });
  }
  return { settings: normalizeToneRig(data.settings), presets };
}

function publish(next: ToneSnapshot, persist: boolean) {
  snapshot = next;
  // Audio updates are synchronous; React rendering never delays a live knob.
  for (const rig of rigs) rig.update(next.settings);
  if (persist && typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* The current session still works. */ }
  }
  for (const listener of listeners) listener();
}

export function initializeToneStore() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const saved = decode(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null"));
    if (saved) publish(saved, false);
    else {
      const legacy = JSON.parse(window.localStorage.getItem("fretflow-tone-guide-v1") || "null");
      const keys = ["gain", "bass", "middle", "treble", "delay", "reverb"] as const;
      if (legacy && keys.every(key => typeof legacy[key] === "number" && Number.isFinite(legacy[key]) && legacy[key] >= 0 && legacy[key] <= 10)) {
        const migrated = { ...DEFAULT_TONE_RIG, ...Object.fromEntries(keys.map(key => [key, legacy[key] * 10])), delayEnabled: legacy.delay > 0, reverbEnabled: legacy.reverb > 0 };
        publish({ settings: normalizeToneRig(migrated), presets: [] }, true);
      }
    }
  } catch { /* Ignore malformed or unavailable storage. */ }
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    try {
      const next = event.newValue === null ? initial : decode(JSON.parse(event.newValue));
      if (next) publish(next, false);
    } catch { /* Ignore malformed updates from another tab. */ }
  });
}

export const getToneSnapshot = () => snapshot;
export const getServerToneSnapshot = () => initial;
export function subscribeTone(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setToneSettings(settings: ToneRigSettings) {
  initializeToneStore();
  publish({ ...snapshot, settings: normalizeToneRig(settings) }, true);
}
export function saveTonePreset(name: string) {
  initializeToneStore();
  const clean = name.trim().slice(0, 48);
  if (!clean) return;
  const existing = snapshot.presets.find(preset => preset.name.toLocaleLowerCase() === clean.toLocaleLowerCase());
  if (!existing && snapshot.presets.length >= 24) return;
  const preset = { id: existing?.id ?? crypto.randomUUID(), name: clean, settings: { ...snapshot.settings } };
  const presets = existing ? snapshot.presets.map(item => item.id === existing.id ? preset : item) : [...snapshot.presets, preset];
  publish({ ...snapshot, presets }, true);
}
export function deleteTonePreset(id: string) {
  publish({ ...snapshot, presets: snapshot.presets.filter(preset => preset.id !== id) }, true);
}

/** One persistent graph per owned playback output; dispose alongside that output. */
export function attachToneRig(context: BaseAudioContext) {
  initializeToneStore();
  const rig = createToneRig(context, snapshot.settings);
  rigs.add(rig);
  let disposed = false;
  return {
    input: rig.input,
    dispose() { if (!disposed) { disposed = true; rigs.delete(rig); rig.dispose(); } }
  };
}
