"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { htmlLanguage, isLocale, localeCookie, localizeResult, pageDescription, pageTitle, translate, type Locale, type Values } from "@/lib/i18n";

const LanguageContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (message: string, values?: Values) => string;
  localize: (message: string) => string;
} | null>(null);

export function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    updateLocale(next);
    try {
      document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch { /* Switching still works for this session when storage is blocked. */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = htmlLanguage(locale);
    document.title = translate(locale, pageTitle);
    document.querySelector('meta[name="description"]')?.setAttribute("content", translate(locale, pageDescription));
  }, [locale]);
  const value = useMemo(() => ({
    locale, setLocale,
    t: (message: string, values?: Values) => translate(locale, message, values),
    localize: (message: string) => localizeResult(locale, message)
  }), [locale, setLocale]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const language = useContext(LanguageContext);
  if (!language) throw new Error("useLanguage requires LanguageProvider");
  return language;
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  return <select className="language-switcher" aria-label="Language / 语言" value={locale} onChange={event => {
    if (isLocale(event.target.value)) setLocale(event.target.value);
  }}>
    <option value="en" lang="en">English</option>
    <option value="zh" lang="zh-CN">中文</option>
  </select>;
}
