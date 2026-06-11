// Dev-only visual check: walks the three acts and screenshots each.
// Usage: node scripts/shot.mjs [baseUrl]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3777";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--headless=new", "--use-angle=metal"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text().slice(0, 200));
});

await page.goto(base, { waitUntil: "load" });
await page.waitForTimeout(2600);
await page.screenshot({ path: "/tmp/ff-intro.png" });

await page.getByRole("button", { name: "Design your guitar" }).click();
await page.waitForTimeout(2600);
await page.screenshot({ path: "/tmp/ff-customize.png" });

// Try a finish + preset before entering the stage.
await page.getByRole("radio", { name: "Terracotta" }).click();
await page.getByRole("radio", { name: /Neo-Soul Glide/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/ff-customize-2.png" });

await page.getByRole("button", { name: "Build the fretboard" }).click();
await page.waitForTimeout(3200);
await page.screenshot({ path: "/tmp/ff-stage.png" });

await page.waitForTimeout(2500);
await page.screenshot({ path: "/tmp/ff-stage-2.png" });

await browser.close();
console.log("done");
