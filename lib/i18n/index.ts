import { messages, type MessageKey } from "./messages";

export const locales = ["zh", "en"] as const;
export type Locale = typeof locales[number];
export type Values = Record<string, string | number>;
export const localeCookie = "fretflow-locale";
export const pageTitle: MessageKey = "FretFlow — From a clip to your next riff";
export const pageDescription: MessageKey = "Turn guitar videos and audio into reviewable chords, notes and guitar tabs. Hear, refine, and practice on an interactive fretboard.";
export const htmlLanguage = (locale: Locale) => locale === "zh" ? "zh-CN" : "en";

export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

// The worker and older saved jobs return Chinese messages. Resolve those at
// display time, preserving the original result and musical data for editing.
const sourceKeys = new Map<string, MessageKey>(Object.entries(messages).map(([en, zh]) => [zh, en as MessageKey]));
const templates = Object.entries(messages).filter(([, zh]) => zh.includes("{count}"));

export function translate(locale: Locale, source: string, values: Values = {}): string {
  const key = Object.hasOwn(messages, source) ? source as MessageKey : sourceKeys.get(source);
  const text = key ? locale === "zh" ? messages[key] : key : source;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}

export function localizeResult(locale: Locale, source: string): string {
  if (source.startsWith("Error: ")) return `${translate(locale, "Error")}: ${localizeResult(locale, source.slice(7))}`;
  const exact = translate(locale, source);
  if (exact !== source || locale === "zh") return exact;
  // Legacy worker key labels and count notices are not translation keys.
  const key = /^([A-G][#b]?) (大调|小调)$/.exec(source);
  if (key) return `${key[1]} ${key[2] === "大调" ? "major" : "minor"}`;
  for (const [en, zh] of templates) {
    const [before, after] = zh.split("{count}");
    if (source.startsWith(before) && source.endsWith(after)) {
      const count = source.slice(before.length, source.length - after.length || undefined);
      if (/^\d+$/.test(count)) return translate(locale, en, { count });
    }
  }
  return exact;
}

export function resolveLocale(saved: string | undefined): Locale {
  // Start in English until the user explicitly chooses a language.
  return isLocale(saved) ? saved : "en";
}
