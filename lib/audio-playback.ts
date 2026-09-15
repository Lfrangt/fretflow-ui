/** Use the media playback session on Safari instead of the ambient/ringer channel. */
export function prepareAudioPlayback() {
  if (typeof navigator === "undefined") return;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch { /* Audio Session is optional; normal gesture activation still applies. */ }
}

/** Call directly from a click/touch gesture, before yielding to React or a timer. */
export async function resumeAudioPlayback(context: AudioContext, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  prepareAudioPlayback();
  if (context.state === "closed") return false;
  if (context.state === "running") return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Safari also exposes "interrupted" after a call, lock, or app switch.
    return await Promise.race([
      context.resume().then(() => !signal?.aborted && context.state === "running"),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 2000); })
    ]);
  } catch { return false; }
  finally { clearTimeout(timer); }
}
