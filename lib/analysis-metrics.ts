import { createHmac } from "node:crypto";

const states = new Set(["queued", "running", "done", "error", "cancelled"]);

/** Operational logs only: no owner, file name, music, error text or capability URL. */
export function analysisMetric(method: string, endpoint: string, status: number, body: unknown, secret?: string) {
  const route = method === "POST" && /^(analyze|demo|jobs\/[a-f0-9]{32}\/reanalyze)$/.test(endpoint)
    ? "submit" : method === "GET" && /^jobs\/[a-f0-9]{32}$/.test(endpoint) ? "poll" : null;
  if (!route) return null;
  const base = { schema: "fretflow.analysis.v1", at: new Date().toISOString(), route };
  if (status >= 400) return { ...base, event: "request_error", http_status: status };
  if (!secret || !body || typeof body !== "object") return null;
  const job = body as { id?: unknown; status?: unknown };
  // Worker admissions return only { id }; a later poll supplies final status.
  const state = route === "submit" && job.status === undefined ? "queued" : job.status;
  if (typeof job.id !== "string" || !/^[a-f0-9]{32}$/.test(job.id) || typeof state !== "string" || !states.has(state)) return null;
  return { ...base, event: "job_observed", job: createHmac("sha256", secret).update(`metrics:${job.id}`).digest("hex").slice(0, 24), status: state };
}

export function logAnalysisMetric(method: string, endpoint: string, status: number, body: unknown, secret?: string) {
  const metric = analysisMetric(method, endpoint, status, body, secret);
  if (metric) console.info(`FRETFLOW_ANALYSIS ${JSON.stringify(metric)}`);
}
