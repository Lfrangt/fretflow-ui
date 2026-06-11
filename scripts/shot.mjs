// Dev-only visual check: landing → practice stage → settings dock.
// Usage: node scripts/shot.mjs [baseUrl]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text().slice(0, 200));
});

await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/ff-landing.png" });

await page.getByRole("button", { name: "Start practice" }).click();
await page.waitForTimeout(800);
// Pause so the active chord stays on Am7 for stable assertions.
await page.getByRole("button", { name: "Pause" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/ff-stage.png" });

await page.getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "/tmp/ff-settings.png" });

await browser.close();
console.log("done");
