// rAF-resolution trace of the fretboard position while hiding settings (P6).
// Mirrors the verifier's methodology: sample .fretboard-hit-area bounding y
// every animation frame after clicking "Hide settings", flag discontinuities.
import { chromium } from "@playwright/test";

const url = process.env.TRACE_URL ?? "http://localhost:3903";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });

await page.getByRole("button", { name: "Start practice" }).click();
await page.waitForTimeout(900);

// Open settings, let it settle.
await page.getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(900);

const trace = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const samples = [];
      const start = performance.now();
      const sample = () => {
        const t = performance.now() - start;
        const fb = document.querySelector(".fretboard-hit-area");
        const stage = document.querySelector(".instrument-stage");
        const slot = document.querySelector(".dock-flow-slot");
        const dock = document.querySelector(".input-dock");
        samples.push({
          t: Math.round(t * 10) / 10,
          fbY: fb ? Math.round(fb.getBoundingClientRect().y * 10) / 10 : null,
          stageH: stage ? Math.round(stage.getBoundingClientRect().height * 10) / 10 : null,
          slotH: slot ? Math.round(slot.getBoundingClientRect().height * 10) / 10 : null,
          dockOpacity: dock ? Number(getComputedStyle(dock).opacity) : null
        });
        if (t < 800) requestAnimationFrame(sample);
        else resolve(samples);
      };
      // Click "Hide settings" and start sampling in the same task.
      const buttons = [...document.querySelectorAll(".session-toolbar button")];
      const hide = buttons.find((b) => b.textContent.includes("Hide settings"));
      hide.click();
      requestAnimationFrame(sample);
    })
);

await browser.close();

// Analyze: largest single-frame fbY jump and total travel.
let maxJump = 0;
let maxJumpAt = 0;
let moves = 0;
for (let i = 1; i < trace.length; i++) {
  const d = Math.abs(trace[i].fbY - trace[i - 1].fbY);
  if (d > 0.5) moves++;
  if (d > maxJump) {
    maxJump = d;
    maxJumpAt = trace[i].t;
  }
}
const first = trace[0];
const last = trace[trace.length - 1];

console.log("samples:", trace.length);
console.log(
  trace
    .map((s) => `t=${s.t} fbY=${s.fbY} stageH=${s.stageH} slotH=${s.slotH} dockOp=${s.dockOpacity}`)
    .join("\n")
);
console.log("---");
console.log(`fbY ${first.fbY} -> ${last.fbY} (travel ${Math.round((last.fbY - first.fbY) * 10) / 10}px)`);
console.log(`frames with movement >0.5px: ${moves}`);
console.log(`largest single-frame fbY jump: ${Math.round(maxJump * 10) / 10}px at t=${maxJumpAt}ms`);
console.log(maxJump > 30 ? "FAIL: discontinuity detected" : "PASS: gradual glide");
