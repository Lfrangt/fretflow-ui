import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const signature = (id: string, secret: string) => createHmac("sha256", secret).update(`fretflow-session:${id}`).digest("hex");

export function workerSession(cookie: string | undefined, secret: string) {
  const [id, mac] = (cookie ?? "").split(".");
  if (/^[a-f0-9]{64}$/.test(id ?? "") && /^[a-f0-9]{64}$/.test(mac ?? "")) {
    const expected = signature(id, secret);
    if (timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return { id, cookie: `${id}.${mac}`, fresh: false };
  }
  const next = randomBytes(32).toString("hex");
  return { id: next, cookie: `${next}.${signature(next, secret)}`, fresh: true };
}
