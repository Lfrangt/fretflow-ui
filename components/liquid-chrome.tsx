"use client";

import { Container, Glass, Renderer, Scene } from "@liquid-dom/core";
import { useEffect, useMemo, useRef, useState } from "react";

type LiquidChromeProps = {
  hasStarted: boolean;
  isFocused: boolean;
  settingsOpen: boolean;
  onActiveChange?: (active: boolean) => void;
};

type ChromeShape = {
  key: "toolbar" | "fretboard" | "dock" | "landing";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

type LiquidRuntime = {
  renderer: Renderer;
  glasses: Record<ChromeShape["key"], Glass>;
  frame: number | null;
};

const hiddenShape = {
  x: -2000,
  y: -2000,
  width: 1,
  height: 1,
  radius: 1
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

async function canUseLiquidRenderer() {
  if (typeof navigator === "undefined") return false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;

  try {
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

function useViewportSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function syncSize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }

    syncSize();
    window.addEventListener("resize", syncSize);
    window.addEventListener("orientationchange", syncSize);
    return () => {
      window.removeEventListener("resize", syncSize);
      window.removeEventListener("orientationchange", syncSize);
    };
  }, []);

  return size;
}

function buildChromeShapes(width: number, height: number, hasStarted: boolean, isFocused: boolean, settingsOpen: boolean) {
  if (!width || !height) return [] as ChromeShape[];

  const phonePortrait = width <= 560 && height > width;
  const phoneLandscape = width <= 940 && height <= 560 && width > height;
  const compact = width <= 860;
  const shapes: ChromeShape[] = [];

  if (!hasStarted) {
    const landingWidth = Math.min(540, width - 28);
    shapes.push({
      key: "landing",
      x: clamp(width * 0.05 - 20, 8, 56),
      y: clamp(height * 0.07 - 18, 8, 48),
      width: landingWidth,
      height: clamp(height * 0.48, 250, 360),
      radius: 34
    });
    return shapes;
  }

  const toolbarWidth = phoneLandscape ? Math.min(430, width - 20) : phonePortrait ? width - 20 : 370;
  const toolbarHeight = phoneLandscape ? 42 : phonePortrait ? 44 : 48;
  shapes.push({
    key: "toolbar",
    x: (width - toolbarWidth) / 2,
    y: phoneLandscape ? 8 : phonePortrait ? 10 : 16,
    width: toolbarWidth,
    height: toolbarHeight,
    radius: toolbarHeight / 2
  });

  if (isFocused) {
    if (phoneLandscape) {
      shapes.push({
        key: "fretboard",
        x: 0,
        y: 86,
        width,
        height: clamp(height - 156, 200, 230),
        radius: 22
      });
    } else if (phonePortrait) {
      shapes.push({
        key: "fretboard",
        x: 0,
        y: settingsOpen ? 140 : 150,
        width,
        height: 230,
        radius: 24
      });
    } else {
      const detailTop = settingsOpen ? clamp(height * 0.33, 255, 382) : clamp(height * 0.4, 300, 460);
      const detailWidth = Math.min(clamp(width * 0.58, 760, 1260), width - 76);
      const detailHeight = settingsOpen ? clamp(width * 0.106, 198, 238) : clamp(width * 0.122, 210, 262);
      shapes.push({
        key: "fretboard",
        x: (width - detailWidth) / 2 - 32,
        y: detailTop - detailHeight / 2 - 28,
        width: detailWidth + 64,
        height: detailHeight + 74,
        radius: 30
      });
    }
  }

  if (settingsOpen) {
    if (phoneLandscape) {
      const dockWidth = Math.min(420, width - 20);
      shapes.push({
        key: "dock",
        x: width - dockWidth - 10,
        y: 56,
        width: dockWidth,
        height: height - 64,
        radius: 20
      });
    } else if (phonePortrait) {
      shapes.push({
        key: "dock",
        x: 10,
        y: 400,
        width: width - 20,
        height: Math.max(330, height - 410),
        radius: 24
      });
    } else {
      const dockWidth = Math.min(compact ? width - 36 : 1000, width - 56);
      const dockHeight = compact ? Math.min(360, height * 0.5) : 224;
      shapes.push({
        key: "dock",
        x: (width - dockWidth) / 2,
        y: height - dockHeight - 14,
        width: dockWidth,
        height: dockHeight,
        radius: 26
      });
    }
  }

  return shapes;
}

export function LiquidChrome({ hasStarted, isFocused, settingsOpen, onActiveChange }: LiquidChromeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<LiquidRuntime | null>(null);
  const [enabled, setEnabled] = useState(false);
  const viewport = useViewportSize();
  const shapes = useMemo(
    () => buildChromeShapes(viewport.width, viewport.height, hasStarted, isFocused, settingsOpen),
    [hasStarted, isFocused, settingsOpen, viewport.height, viewport.width]
  );

  useEffect(() => {
    let cancelled = false;

    void canUseLiquidRenderer().then((active) => {
      if (cancelled) return;
      setEnabled(active);
      onActiveChange?.(active);
    });

    return () => {
      cancelled = true;
    };
  }, [onActiveChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;

    const scene = new Scene();
    const container = new Container({
      opacity: 0.48,
      blur: 18,
      spacing: 18,
      bezelWidth: 20,
      thickness: 104,
      displacementFactor: 1.15,
      displacementBlur: 7,
      ior: 1.45,
      dispersion: 0.018,
      surfaceProfile: "convex",
      specularStrength: 1.35,
      specularWidth: 1.2,
      specularFalloff: 0.78,
      specularSharpness: 2.7,
      specularOpacity: 0.58,
      reflectionOffset: 22,
      tint: { r: 0.98, g: 0.96, b: 0.9, a: 0.2 },
      shadowColor: { r: 0.22, g: 0.18, b: 0.12, a: 0.16 },
      shadowOffsetY: 12,
      shadowBlur: 34,
      shadowSpread: 0
    });
    const glasses = {
      toolbar: new Glass(hiddenShape),
      fretboard: new Glass(hiddenShape),
      dock: new Glass(hiddenShape),
      landing: new Glass(hiddenShape)
    };

    Object.values(glasses).forEach((glass) => {
      glass.cornerSmoothing = 0.64;
      container.add(glass);
    });
    scene.add(container);

    const renderer = new Renderer({ scene, maxDpr: 1.65 });
    renderer.canvas.className = "liquid-chrome-canvas";
    host.append(renderer.canvas);

    const runtime: LiquidRuntime = { renderer, glasses, frame: null };
    runtimeRef.current = runtime;

    function tick() {
      try {
        renderer.render();
        runtime.frame = window.requestAnimationFrame(tick);
      } catch (error) {
        console.error(error);
        setEnabled(false);
        onActiveChange?.(false);
      }
    }

    runtime.frame = window.requestAnimationFrame(tick);

    return () => {
      if (runtime.frame !== null) window.cancelAnimationFrame(runtime.frame);
      renderer.destroy();
      renderer.canvas.remove();
      runtimeRef.current = null;
    };
  }, [enabled, onActiveChange]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    const visible = new Map(shapes.map((shape) => [shape.key, shape]));
    Object.entries(runtime.glasses).forEach(([key, glass]) => {
      const shape = visible.get(key as ChromeShape["key"]) ?? hiddenShape;
      glass.x = shape.x;
      glass.y = shape.y;
      glass.width = Math.max(1, shape.width);
      glass.height = Math.max(1, shape.height);
      glass.cornerRadius = shape.radius;
    });
  }, [shapes]);

  if (!enabled) return null;

  return <div ref={hostRef} className="liquid-chrome-layer" aria-hidden="true" />;
}
