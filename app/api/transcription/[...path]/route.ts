import { NextRequest } from "next/server";
import { workerSession } from "@/lib/worker-session";
import { logAnalysisMetric } from "@/lib/analysis-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Keep model credentials and addresses on the server. The worker accepts only
// this narrow API surface; arbitrary upstream URLs are never client-controlled.
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!/^(health|catalog|analyze|upload-ticket|demo|jobs(?:\/[a-f0-9]{32}(?:\/(?:audio|score|reanalyze|stems\/(?:guitar|vocals|drums|bass|piano|other|instrumental)|export\/(?:json|chords\.csv|chords\.txt|notes\.mid|chords\.mid|score\.musicxml|source\.mp3)))?)?)$/.test(endpoint)) {
    return Response.json({ detail: "Unknown transcription endpoint" }, { status: 404 });
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && !["http://", "https://"].some((scheme) => origin === scheme + request.headers.get("host"))) {
      return Response.json({ detail: "Cross-origin requests are not accepted" }, { status: 403 });
    }
  }
  const base = process.env.FRETFLOW_WORKER_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8771" : "");
  if (!base) return Response.json({ detail: "音频分析服务尚未配置。请启动 FretFlow worker。" }, { status: 503 });
  const secret = process.env.FRETFLOW_WORKER_TOKEN;
  const hosted = process.env.FRETFLOW_HOSTED === "1";
  if (hosted && (!secret || secret.length < 32)) return Response.json({ detail: "Analysis service configuration is incomplete." }, { status: 503 });
  const session = hosted ? workerSession(request.cookies.get("fretflow-session")?.value, secret!) : null;
  const headers = new Headers();
  for (const name of ["content-type", "range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (secret) headers.set("authorization", `Bearer ${secret}`);
  if (session) headers.set("x-fretflow-owner", session.id);
  headers.set("x-fretflow-origin", request.nextUrl.origin);
  const finish = (response: Response) => {
    if (session?.fresh) response.headers.append("Set-Cookie", `fretflow-session=${session.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${request.nextUrl.protocol === "https:" ? "; Secure" : ""}`);
    return response;
  };
  try {
    // Large audio and video never transit a Vercel Function. The worker grants
    // narrowly scoped, expiring capabilities after checking this user's session.
    if (hosted && request.method === "GET" && /^jobs\/[a-f0-9]{32}\/(audio|stems\/|export\/)/.test(endpoint)) {
      headers.set("x-fretflow-download-path", `/api/${endpoint}`);
      const grant = await fetch(`${base.replace(/\/$/, "")}/api/jobs/${path[1]}/download-ticket`, { headers, cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const data = await grant.json();
      if (!grant.ok) return finish(Response.json(data, { status: grant.status }));
      const target = new URL(`/api/${endpoint}`, base);
      target.searchParams.set("ticket", data.ticket);
      return finish(new Response(null, { status: 307, headers: { Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }));
    }
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method, headers, cache: "no-store", signal: AbortSignal.timeout(55_000)
    };
    if (!["GET", "HEAD"].includes(request.method)) {
      init.body = request.body;
      init.duplex = "half";
    }
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/${endpoint}`, init);
    if ((request.method === "GET" && /^jobs\/[a-f0-9]{32}$/.test(endpoint)) ||
        (request.method === "POST" && /^(analyze|demo|jobs\/[a-f0-9]{32}\/reanalyze)$/.test(endpoint))) {
      // Reading a clone preserves the response. Metrics must never break analysis.
      try { logAnalysisMetric(request.method, endpoint, upstream.status, upstream.ok ? await upstream.clone().json() : null, secret); } catch { /* Best effort. */ }
    }
    if (endpoint === "upload-ticket" && upstream.ok) {
      const data = await upstream.json();
      return finish(Response.json({ ...data, url: data.direct ? `${base.replace(/\/$/, "")}/api/analyze` : undefined }, { headers: { "Cache-Control": "no-store" } }));
    }
    const output = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition", "content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) output.set(name, value);
    }
    return finish(new Response(upstream.body, { status: upstream.status, headers: output }));
  } catch {
    logAnalysisMetric(request.method, endpoint, 503, null, secret);
    return Response.json({ detail: "暂时无法连接分析服务，请确认 worker 已启动后重试。" }, { status: 503 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE, proxy as HEAD };
