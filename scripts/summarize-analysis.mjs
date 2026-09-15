import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function summarizeAnalysis(text) {
  const jobs = new Map();
  const requests = new Map();
  const seenErrors = new Set();
  for (const line of text.split("\n")) {
    let message = line;
    let wrapper;
    try { wrapper = JSON.parse(line); message = wrapper.message ?? line; } catch { /* Plain logs supported too. */ }
    const marker = message.indexOf("FRETFLOW_ANALYSIS ");
    if (marker < 0) continue;
    let event;
    try { event = JSON.parse(message.slice(marker + "FRETFLOW_ANALYSIS ".length)); } catch { continue; }
    if (event.schema !== "fretflow.analysis.v1") continue;
    if (event.event === "request_error") {
      const id = wrapper?.id ?? JSON.stringify(event);
      if (seenErrors.has(id)) continue;
      seenErrors.add(id);
      const key = `${event.route}:${event.http_status}`;
      requests.set(key, (requests.get(key) ?? 0) + 1);
    } else if (event.event === "job_observed" && /^[a-f0-9]{24}$/.test(event.job)) {
      const previous = jobs.get(event.job);
      if (!previous || event.at > previous.at) jobs.set(event.job, event);
    }
  }
  const counts = { done: 0, error: 0, cancelled: 0, pending: 0 };
  for (const job of jobs.values()) {
    if (["done", "error", "cancelled"].includes(job.status)) counts[job.status]++;
    else counts.pending++;
  }
  return { observed_jobs: jobs.size, ...counts,
    success_rate_of_observed_done_or_error: counts.done + counts.error ? counts.done / (counts.done + counts.error) : null,
    request_errors: Object.fromEntries(requests),
    coverage: "Gateway observations in the supplied logs only. Cancelled and pending jobs are excluded from success rate. Missing final polls and expired logs remain unknown; this is not visitor count." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(summarizeAnalysis(readFileSync(process.argv[2] ?? 0, "utf8")), null, 2));
}
