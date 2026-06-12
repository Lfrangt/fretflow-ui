// Verify the open-settings direction and that the flow slot releases its
// inline height (back to auto) so dock content can still resize freely.
import { chromium } from "@playwright/test";

const url = process.env.TRACE_URL ?? "http://localhost:3903";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });

await page.getByRole("button", { name: "Start practice" }).click();
await page.waitForTimeout(900);

// Open settings while sampling.
const openTrace = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [];
      const start = performance.now();
      const sample = () => {
        const t = performance.now() - start;
        const fb = document.querySelector(".fretboard-hit-area");
        const slot = document.querySelector(".dock-flow-slot");
        samples.push({
          t: Math.round(t),
          fbY: fb ? Math.round(fb.getBoundingClientRect().y) : null,
          slotH: slot ? Math.round(slot.getBoundingClientRect().height) : null
        });
        if (t < 800) requestAnimationFrame(sample);
        else resolve(samples);
      };
      const buttons = [...document.querySelectorAll(".session-toolbar button")];
      buttons.find((b) => b.textContent.includes("Settings")).click();
      requestAnimationFrame(sample);
    })
);
console.log("OPEN:", openTrace.map((s) => `t=${s.t} fbY=${s.fbY} slotH=${s.slotH}`).join(" | "));

await page.waitForTimeout(300);
const inlineHeight = await page.evaluate(() => document.querySelector(".dock-flow-slot").style.height);
console.log("slot inline height after open:", JSON.stringify(inlineHeight));

// Switch dock modes — content must be able to resize.
const hBefore = await page.evaluate(() => document.querySelector(".input-dock").getBoundingClientRect().height);
await page.getByRole("button", { name: "MP3 Pro" }).click();
await page.waitForTimeout(400);
const hAfter = await page.evaluate(() => document.querySelector(".input-dock").getBoundingClientRect().height);
console.log(`dock height text-mode=${Math.round(hBefore)} mp3-mode=${Math.round(hAfter)} (resizes: ${hBefore !== hAfter})`);

// Hide again — full toggle cycle still works, dock fully unmounts.
await page.getByRole("button", { name: "Hide settings" }).click();
await page.waitForTimeout(800);
const gone = await page.evaluate(() => ({
  slot: !!document.querySelector(".dock-flow-slot"),
  dock: !!document.querySelector(".input-dock")
}));
console.log("after hide: slot/dock still in DOM:", gone.slot, gone.dock);

await page.screenshot({ path: "/tmp/p6-after-hide.png" });
await browser.close();
