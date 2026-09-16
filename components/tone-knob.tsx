"use client";

import { useId, useRef, type CSSProperties, type PointerEvent } from "react";

type ToneKnobProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

/** A native, keyboard-accessible slider with an amp-style vertical drag surface. */
export function ToneKnob({ label, value, onChange, disabled = false, min = 0, max = 100, step = 1, unit = "" }: ToneKnobProps) {
  const id = useId();
  const drag = useRef<{ pointerId: number; y: number; value: number } | null>(null);
  const fraction = (value - min) / (max - min);
  function finish(event: PointerEvent<HTMLInputElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="tone-knob" data-disabled={disabled || undefined}>
    <label htmlFor={id}>{label}</label>
    <div className="tone-knob-surface" style={{ "--knob-angle": `${-135 + fraction * 270}deg` } as CSSProperties}>
      <svg className="tone-knob-ring" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r="32" pathLength="100" strokeDasharray="75 100" transform="rotate(135 36 36)" />
        <circle className="tone-knob-level" cx="36" cy="36" r="32" pathLength="100" strokeDasharray={`${fraction * 75} 100`} transform="rotate(135 36 36)" />
      </svg>
      <span className="tone-knob-cap" aria-hidden="true"><span className="tone-knob-pointer" /></span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        aria-label={label} aria-valuetext={`${value}${unit ? ` ${unit}` : ""}`}
        onChange={event => { if (!drag.current) onChange(Number(event.target.value)); }}
        onPointerDown={event => {
          if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { pointerId: event.pointerId, y: event.clientY, value };
        }}
        onPointerMove={event => {
          const origin = drag.current;
          if (!origin || origin.pointerId !== event.pointerId) return;
          const next = origin.value + (origin.y - event.clientY) * (max - min) / 160;
          onChange(Math.min(max, Math.max(min, Math.round((next - min) / step) * step + min)));
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { drag.current = null; }} />
    </div>
    <output htmlFor={id}>{value}{unit && <span> {unit}</span>}</output>
  </div>;
}
