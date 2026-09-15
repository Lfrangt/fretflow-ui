type Engine = typeof import("@coderline/alphatab");
let pending: Promise<Engine> | undefined;

// Use the official browser distribution so both the synthesizer worker and
// AudioWorklet resolve against the same local assets in Next/Turbopack.
export function loadNotationEngine(): Promise<Engine> {
  if (pending) return pending;
  pending = new Promise<Engine>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/alphatab/alphaTab.min.js";
    script.async = true;
    script.onload = () => {
      const engine = (window as unknown as { alphaTab?: Engine }).alphaTab;
      if (engine) {
        const source = new URL("/alphatab/alphaTab.min.js", window.location.href).href;
        engine.Environment.initializeMain(
          () => new Worker(source),
          (context) => context.audioWorklet.addModule(source)
        );
        resolve(engine);
      }
      else { pending = undefined; script.remove(); reject(new Error("Notation engine did not initialize")); }
    };
    script.onerror = () => { pending = undefined; script.remove(); reject(new Error("Unable to load notation engine")); };
    document.head.appendChild(script);
  });
  return pending;
}
