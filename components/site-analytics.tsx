"use client";

import { Analytics } from "@vercel/analytics/react";

export function SiteAnalytics() {
  return <Analytics beforeSend={event => {
    // Count only the public workspace. Never send query strings or job URLs.
    const url = new URL(event.url);
    if (url.pathname !== "/") return null;
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  }} />;
}
