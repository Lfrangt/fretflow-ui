export type EngineChord = {
  start?: number;
  end?: number;
  time?: number;
  chord?: string;
  label?: string;
  confidence?: number;
};

export type EngineResponse = {
  success: boolean;
  error?: string;
  provider?: string;
  chords?: EngineChord[];
  duration?: number;
  model_used?: string;
  model_name?: string;
  chord_dict?: string;
  key?: string;
  bpm?: number;
  raw?: unknown;
};

type JsonObject = Record<string, unknown>;

export class AudioEngineError extends Error {
  status: number;
  raw?: unknown;

  constructor(message: string, status = 502, raw?: unknown) {
    super(message);
    this.name = "AudioEngineError";
    this.status = status;
    this.raw = raw;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readNumber(source: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (typeof value === "number") return value;
  }
  return undefined;
}

function readString(source: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(source[key]);
    if (value) return value;
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string" && parsed.trim().startsWith("{")) return tryParseJson(parsed);
    if (typeof parsed === "string" && parsed.trim().startsWith("[")) return tryParseJson(parsed);
    return parsed;
  } catch {
    return text;
  }
}

async function readPayload(response: Response) {
  const text = await response.text();
  return text ? tryParseJson(text) : null;
}

function resolveUrl(baseUrl: string, value: unknown, fallbackPath: string) {
  const candidate = stringValue(value) ?? fallbackPath;
  try {
    return new URL(candidate).toString();
  } catch {
    return new URL(candidate, baseUrl).toString();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chordLabelFromObject(source: JsonObject): string | null {
  const direct = readString(source, [
    "chord",
    "label",
    "symbol",
    "chord_symbol",
    "chordSymbol",
    "harmony",
    "name"
  ]);
  if (direct) return direct;

  const nested = source.chord;
  if (isObject(nested)) {
    const nestedLabel = chordLabelFromObject(nested);
    if (nestedLabel) return nestedLabel;
  }

  const root = readString(source, ["root", "tonic"]);
  const quality = readString(source, ["quality", "kind", "type", "suffix"]);
  if (root) return `${root}${quality ?? ""}`;

  return null;
}

function chordFromArray(source: unknown[]) {
  const first = numberValue(source[0]);
  const second = numberValue(source[1]);
  const third = stringValue(source[2]);
  const secondAsChord = stringValue(source[1]);

  if (typeof first === "number" && typeof second === "number" && third) {
    return { start: first, end: second, chord: third };
  }

  if (typeof first === "number" && secondAsChord) {
    return { start: first, chord: secondAsChord };
  }

  return null;
}

function chordFromObject(source: JsonObject) {
  const label = chordLabelFromObject(source);
  if (!label) return null;

  const start = readNumber(source, ["start", "start_time", "startTime", "onset", "time", "timestamp", "begin"]);
  const end = readNumber(source, ["end", "end_time", "endTime", "offset", "stop"]);
  const duration = readNumber(source, ["duration", "dur"]);
  const confidence = readNumber(source, ["confidence", "probability", "score"]);

  return {
    start,
    end: typeof end === "number" ? end : typeof start === "number" && typeof duration === "number" ? start + duration : undefined,
    time: start,
    chord: label,
    confidence
  };
}

function extractChordTimeline(raw: unknown) {
  const chords: EngineChord[] = [];
  const seen = new WeakSet<object>();

  function visit(node: unknown, depth = 0) {
    if (depth > 7 || node == null) return;

    if (Array.isArray(node)) {
      const direct = chordFromArray(node);
      if (direct) chords.push(direct);
      for (const item of node) visit(item, depth + 1);
      return;
    }

    if (!isObject(node) || seen.has(node)) return;
    seen.add(node);

    const direct = chordFromObject(node);
    if (direct) chords.push(direct);

    const preferredKeys = [
      "chords",
      "chord_events",
      "chordEvents",
      "chord_progression",
      "chordProgression",
      "harmonies",
      "harmony",
      "segments",
      "events",
      "annotations",
      "result",
      "results",
      "data",
      "tracks",
      "bars",
      "measures"
    ];

    for (const key of preferredKeys) visit(node[key], depth + 1);
    if (depth < 3) {
      for (const value of Object.values(node)) visit(value, depth + 1);
    }
  }

  visit(raw);

  return chords
    .filter((entry) => stringValue(entry.chord ?? entry.label))
    .sort((a, b) => (a.start ?? a.time ?? 0) - (b.start ?? b.time ?? 0))
    .filter((entry, index, list) => {
      const label = entry.chord ?? entry.label;
      const previous = list[index - 1];
      return label !== (previous?.chord ?? previous?.label) || (entry.start ?? entry.time) !== (previous?.start ?? previous?.time);
    })
    .map((entry, index, list) => {
      const start = entry.start ?? entry.time;
      const nextStart = list[index + 1]?.start ?? list[index + 1]?.time;
      return {
        ...entry,
        start,
        time: start,
        end: entry.end ?? (typeof start === "number" && typeof nextStart === "number" ? nextStart : undefined)
      };
    });
}

function extractGlobalNumber(raw: unknown, keys: string[]) {
  let found: number | undefined;

  function visit(node: unknown, depth = 0) {
    if (depth > 4 || found !== undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!isObject(node)) return;

    found = readNumber(node, keys);
    if (found !== undefined) return;
    for (const value of Object.values(node)) visit(value, depth + 1);
  }

  visit(raw);
  return found;
}

function extractGlobalString(raw: unknown, keys: string[]) {
  let found: string | undefined;

  function visit(node: unknown, depth = 0) {
    if (depth > 4 || found) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!isObject(node)) return;

    found = readString(node, keys) ?? undefined;
    if (found) return;
    for (const value of Object.values(node)) visit(value, depth + 1);
  }

  visit(raw);
  return found;
}

async function analyzeWithChordMini(audio: File): Promise<EngineResponse> {
  const workerUrl = process.env.CHORDMINI_API_URL ?? process.env.CHORD_ENGINE_URL ?? "http://localhost:5001";
  const workerFormData = new FormData();
  workerFormData.append("file", audio, audio.name);
  workerFormData.append("detector", process.env.CHORD_ENGINE_DETECTOR ?? "chord-cnn-lstm");
  workerFormData.append("chord_dict", process.env.CHORD_ENGINE_DICT ?? "full");
  workerFormData.append("force", "true");

  const response = await fetch(`${workerUrl}/api/recognize-chords`, {
    method: "POST",
    body: workerFormData,
    signal: AbortSignal.timeout(300_000)
  });

  const payload = (await response.json().catch(() => null)) as Partial<EngineResponse> | null;

  if (!response.ok || !payload?.success) {
    throw new AudioEngineError(
      payload?.error ??
        `ChordMini returned ${response.status}. The uploaded MP3 was not converted to practice presets.`,
      response.ok ? 502 : response.status,
      payload
    );
  }

  return {
    ...payload,
    success: true,
    provider: "chordmini",
    model_name: payload.model_name ?? payload.model_used ?? "ChordMini Chord-CNN-LSTM",
    chord_dict: payload.chord_dict ?? process.env.CHORD_ENGINE_DICT ?? "full"
  };
}

async function analyzeWithKlangio(audio: File): Promise<EngineResponse> {
  const apiKey = process.env.KLANGIO_API_KEY;
  if (!apiKey) {
    throw new AudioEngineError("KLANGIO_API_KEY is not configured on the server.", 503);
  }

  const baseUrl = process.env.KLANGIO_API_URL ?? "https://api.klang.io";
  const vocabulary = process.env.KLANGIO_VOCABULARY ?? process.env.CHORD_ENGINE_DICT ?? "full";
  const useExtended = process.env.KLANGIO_EXTENDED !== "false";
  const timeoutMs = Number(process.env.KLANGIO_TIMEOUT_MS ?? 270_000);
  const pollIntervalMs = Number(process.env.KLANGIO_POLL_INTERVAL_MS ?? 2_500);
  const endpoint = useExtended ? "/chord-recognition-extended" : "/chord-recognition";
  const requestUrl = new URL(endpoint, baseUrl);
  requestUrl.searchParams.set("vocabulary", vocabulary);

  const formData = new FormData();
  formData.append("file", audio, audio.name);

  const createResponse = await fetch(requestUrl, {
    method: "POST",
    headers: { "kl-api-key": apiKey },
    body: formData,
    signal: AbortSignal.timeout(60_000)
  });
  const createPayload = await readPayload(createResponse);

  if (!createResponse.ok || !isObject(createPayload) || !stringValue(createPayload.job_id)) {
    throw new AudioEngineError(
      isObject(createPayload) && typeof createPayload.detail === "string"
        ? createPayload.detail
        : `Klangio chord recognition request failed with ${createResponse.status}.`,
      createResponse.ok ? 502 : createResponse.status,
      createPayload
    );
  }

  const jobId = stringValue(createPayload.job_id)!;
  const statusUrl = resolveUrl(baseUrl, createPayload.status_endpoint_url, `/job/${jobId}/status`);
  const deadline = Date.now() + timeoutMs;
  let statusPayload: unknown = null;

  while (Date.now() < deadline) {
    const statusResponse = await fetch(statusUrl, {
      headers: { "kl-api-key": apiKey },
      signal: AbortSignal.timeout(30_000)
    });
    statusPayload = await readPayload(statusResponse);

    if (!statusResponse.ok) {
      throw new AudioEngineError(
        `Klangio job status failed with ${statusResponse.status}.`,
        statusResponse.status,
        statusPayload
      );
    }

    const status = isObject(statusPayload) ? stringValue(statusPayload.status) : null;
    if (status === "COMPLETED") break;
    if (status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT") {
      throw new AudioEngineError(
        isObject(statusPayload) && typeof statusPayload.error === "string"
          ? statusPayload.error
          : `Klangio job ${jobId} ended with ${status}.`,
        502,
        statusPayload
      );
    }

    await sleep(pollIntervalMs);
  }

  if (Date.now() >= deadline) {
    throw new AudioEngineError(`Klangio job ${jobId} did not finish before the server timeout.`, 504, statusPayload);
  }

  const resultUrl = new URL(`/job/${jobId}/json`, baseUrl);
  const resultResponse = await fetch(resultUrl, {
    headers: { "kl-api-key": apiKey },
    signal: AbortSignal.timeout(60_000)
  });
  const raw = await readPayload(resultResponse);

  if (!resultResponse.ok) {
    throw new AudioEngineError(`Klangio JSON result failed with ${resultResponse.status}.`, resultResponse.status, raw);
  }

  const chords = extractChordTimeline(raw);
  if (!chords.length) {
    throw new AudioEngineError("Klangio completed, but no chord timeline was found in the JSON result.", 502, raw);
  }

  return {
    success: true,
    provider: "klangio",
    chords,
    raw,
    model_name: useExtended ? "Klangio Chord Recognition Extended" : "Klangio Chord Recognition",
    chord_dict: vocabulary,
    key: extractGlobalString(raw, ["key", "detected_key", "detectedKey", "tonality"]),
    bpm: extractGlobalNumber(raw, ["bpm", "tempo", "beats_per_minute"]),
    duration: extractGlobalNumber(raw, ["duration", "length", "audio_duration"])
  };
}

export async function analyzeAudio(audio: File) {
  const provider = (process.env.CHORD_ENGINE_PROVIDER ?? "klangio").trim().toLowerCase();

  if (provider === "klangio") return analyzeWithKlangio(audio);
  if (provider === "chordmini") return analyzeWithChordMini(audio);

  throw new AudioEngineError(`Unknown CHORD_ENGINE_PROVIDER: ${provider}`, 500);
}
