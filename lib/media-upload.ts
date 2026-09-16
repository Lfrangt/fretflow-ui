export type UploadProgress = {
  stage: "preparing" | "authorizing" | "uploading" | "waiting";
  loaded: number;
  total: number;
  originalBytes: number;
  bytesPerSecond: number;
};

export const DURATION_ERROR = "Clip exceeds the server duration limit. Select a shorter segment.";
export const SIZE_ERROR = "File exceeds the server upload limit. Please trim it first.";

export function validateClip(start: number, end: number | null, duration: number | null, maximum: number) {
  const knownDuration = duration !== null && Number.isFinite(duration) && duration > 0;
  const effectiveEnd = end === null ? (knownDuration ? duration : null) : (knownDuration ? Math.min(end, duration) : end);
  if (!Number.isFinite(start) || start < 0 || (end !== null && (!Number.isFinite(end) || end <= start || end - start > maximum)) ||
      (knownDuration && start >= duration) || (effectiveEnd !== null && effectiveEnd - start > maximum + 0.001)) {
    throw new Error(DURATION_ERROR);
  }
}

/** Copy the encoded audio track; never decode, resample or re-encode the recording. */
export async function prepareMediaUpload(file: File, options: {
  start: number; end: number | null; maxDuration: number; maxBytes: number;
  duration: number | null; signal: AbortSignal; onProgress?: (fraction: number) => void;
}): Promise<File> {
  const { signal } = options;
  signal.throwIfAborted();
  validateClip(options.start, options.end, options.duration, options.maxDuration);
  const { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat, Conversion } = await import("mediabunny");
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let conversion: Awaited<ReturnType<typeof Conversion.init>> | undefined;
  const cancel = () => { void conversion?.cancel().catch(() => {}); input.dispose(); };
  signal.addEventListener("abort", cancel, { once: true });
  let prepared = file;
  try {
    const duration = await input.computeDuration();
    signal.throwIfAborted();
    validateClip(options.start, options.end, duration, options.maxDuration);
    const audio = await input.getPrimaryAudioTrack();
    const videos = await input.getVideoTracks();
    if (audio && videos.length) {
      const target = new BufferTarget();
      const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "in-memory" }) });
      conversion = await Conversion.init({
        input, output, tracks: "primary", video: { discard: true },
        // Preserve source timestamps so clip selection and original playback still line up.
        trim: { start: 0 }, copy: { mode: "forced", shiftTolerance: 0 }, tags: {}, showWarnings: false,
      });
      signal.throwIfAborted();
      if (conversion.isValid) {
        conversion.onProgress = (fraction) => options.onProgress?.(fraction);
        await conversion.execute();
        signal.throwIfAborted();
        if (target.buffer && target.buffer.byteLength > 0 && target.buffer.byteLength < file.size) {
          prepared = new File([target.buffer], file.name.replace(/\.[^.]+$/, "") + ".m4a", { type: "audio/mp4" });
        }
      }
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.message === DURATION_ERROR) throw error;
    // FFmpeg accepts formats that browsers cannot demux. Keep their original upload path.
  } finally {
    signal.removeEventListener("abort", cancel);
    input.dispose();
  }
  signal.throwIfAborted();
  if (prepared.size > options.maxBytes) throw new Error(SIZE_ERROR);
  return prepared;
}

/** XHR exposes actual sent bytes, unlike fetch. Tickets are never automatically replayed. */
export function uploadMedia<T>(url: string, body: FormData, options: {
  ticket?: string; signal: AbortSignal; originalBytes: number;
  onProgress: (progress: UploadProgress) => void;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let idleTimer: ReturnType<typeof setTimeout>;
    let settled = false;
    const started = performance.now();
    const file = body.get("file");
    let total = file instanceof Blob ? file.size : 0;
    let loaded = 0;
    const finish = (error?: Error, result?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      options.signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(result as T);
    };
    const abort = () => { finish(new DOMException("Upload cancelled.", "AbortError")); xhr.abort(); };
    const touch = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        finish(new Error("Upload stalled. Check your connection and try again.")); xhr.abort();
      }, 60_000);
    };
    const progress = (stage: UploadProgress["stage"]) => options.onProgress({
      stage, loaded, total, originalBytes: options.originalBytes,
      bytesPerSecond: loaded / Math.max((performance.now() - started) / 1000, .001),
    });
    if (options.signal.aborted) { abort(); return; }
    options.signal.addEventListener("abort", abort, { once: true });
    xhr.open("POST", url);
    xhr.withCredentials = false;
    xhr.timeout = 15 * 60_000;
    if (options.ticket) xhr.setRequestHeader("X-FretFlow-Ticket", options.ticket);
    xhr.upload.onprogress = (event) => {
      loaded = event.loaded; if (event.lengthComputable) total = event.total;
      touch(); progress("uploading");
    };
    xhr.upload.onload = () => { loaded = total; touch(); progress("waiting"); };
    xhr.onload = () => {
      let data;
      try { data = JSON.parse(xhr.responseText); }
      catch { finish(new Error("Request failed. Check your input and try again.")); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error(typeof data.detail === "string" ? data.detail : "Request failed. Check your input and try again."));
      } else finish(undefined, data);
    };
    xhr.onerror = () => finish(new Error("Unable to connect to the analysis service. Please try again."));
    xhr.ontimeout = () => finish(new Error("Upload stalled. Check your connection and try again."));
    xhr.onabort = () => finish(new DOMException("Upload cancelled.", "AbortError"));
    touch(); progress("uploading");
    try { xhr.send(body); } catch (error) { finish(error as Error); }
  });
}
