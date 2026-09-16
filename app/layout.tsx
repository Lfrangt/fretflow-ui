import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/language-provider";
import { SiteAnalytics } from "@/components/site-analytics";
import { htmlLanguage, pageDescription, pageTitle, translate } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import "./globals.css";
import "./practice-workspace.css";
import "./transcription.css";
import "./language.css";
import "./mobile-practice.css";
import "./chord-finder.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translate(locale, pageTitle), description: translate(locale, pageDescription) };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  return <html lang={htmlLanguage(locale)}>
    <body><LanguageProvider initialLocale={locale}>{children}</LanguageProvider><SiteAnalytics /></body>
  </html>;
}
