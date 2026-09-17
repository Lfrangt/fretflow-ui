"use client";

import { AnimatePresence, motion, useIsPresent, useMotionValue, useTransform } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { fingerMotionDuration, reconcileFingers, restingFinger, sameContact, sampleFingerMotion, type FingerContact, type FingerPose } from "@/lib/finger-motion";

const colorClass = (interval: string) => interval === "R" ? "root" : ["3", "b3"].includes(interval) ? "third" : ["5", "b5", "#5"].includes(interval) ? "fifth" : interval.includes("7") ? "seventh" : "extension";
type Position = { x: number; y: number };
type PhotoLayout = { width: number; height: number; scale: number; diameter: number; labels: Position[] };

export function FingerMarkers({ markers, position, duration, photo = false, immediate = false, photoLayout }: {
  markers: FingerContact[]; position: (marker: FingerContact) => Position; duration: number; photo?: boolean; immediate?: boolean; photoLayout?: PhotoLayout;
}) {
  const signature = JSON.stringify(markers);
  const [state, setState] = useState(() => ({ signature, ...reconcileFingers({ tracks: [], nextId: 0 }, markers, true) }));
  if (state.signature !== signature) setState({ signature, ...reconcileFingers(state, markers) });
  return <AnimatePresence initial={false}>{state.tracks.map((track, i) => <FingerMarker key={track.id}
    marker={track.marker} position={position(track.marker)} entering={track.entering} photo={photo} photoLayout={photoLayout} callout={photoLayout?.labels[i]}
    duration={immediate ? 0 : fingerMotionDuration(duration)} />)}</AnimatePresence>;
}

function FingerMarker({ marker, position, duration, entering, photo, photoLayout, callout }: {
  marker: FingerContact; position: Position; duration: number; entering: boolean; photo: boolean; photoLayout?: PhotoLayout; callout?: Position;
}) {
  const isPresent = useIsPresent();
  const initial = { ...restingFinger(position.x, position.y), opacity: entering && duration ? 0 : 1 };
  const pose = useRef<FingerPose>(initial);
  const previous = useRef<FingerContact | null>(entering ? null : marker);
  const trajectoryBefore = useRef<FingerContact | null>(previous.current);
  const endpoint = useRef(position);
  const x = useMotionValue(initial.x), y = useMotionValue(initial.y), lift = useMotionValue(0);
  const roll = useMotionValue(0), scaleX = useMotionValue(1), scaleY = useMotionValue(1), opacity = useMotionValue(initial.opacity), pressure = useMotionValue(1);
  const left = useTransform(x, value => `${value * 100}%`), top = useTransform(y, value => `${value * 100}%`);
  const labelRotation = useTransform(roll, value => -value);
  const lineX = useTransform(x, value => value * (photoLayout?.width ?? 1));
  const lineY = useTransform(() => y.get() * (photoLayout?.height ?? 1) + lift.get());
  const shadow = useTransform(pressure, value => `inset 0 1px 1px #fff8, 0 ${1 + (1 - value) * 6}px ${2 + (1 - value) * 8}px rgb(0 0 0 / ${.16 + value * .1})`);
  const contact = `${marker.string}:${marker.fret}:${marker.finger}`;
  useLayoutEffect(() => {
    if (!isPresent) return;
    const before = previous.current;
    const changed = before === null || !sameContact(before, marker);
    const reprojected = endpoint.current.x !== position.x || endpoint.current.y !== position.y;
    endpoint.current = position;
    if (changed) trajectoryBefore.current = before;
    previous.current = marker;
    const target = restingFinger(position.x, position.y);
    const apply = (value: FingerPose) => {
      pose.current = value;
      x.set(value.x); y.set(value.y); lift.set(value.lift); roll.set(value.roll);
      scaleX.set(value.scaleX); scaleY.set(value.scaleY); opacity.set(value.opacity); pressure.set(value.pressure);
    };
    // Resize/Focus/guitar changes reproject the same contacts without pretending
    // a hand has changed chord. Notes and reduced motion go straight to target.
    const settled = (Object.keys(target) as (keyof FingerPose)[]).every(key => Math.abs(pose.current[key] - target[key]) < .00001);
    if (!duration || (!changed && (reprojected || settled))) { apply(target); return; }
    const from = { ...pose.current };
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / (duration * 1000));
      apply(sampleFingerMotion(from, target, trajectoryBefore.current, marker, progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Contact identity, endpoint and timing are the complete animation inputs.
    // Interval/color changes do not restart a finger that is already in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, position.x, position.y, duration, isPresent]);
  const exit = { opacity: 0, transition: { duration: Math.min(.1, duration * .25) } };
  return <>
    <motion.span className={`practice-note ${colorClass(marker.interval)}`} data-finger={marker.finger} data-string={marker.string} data-fret={marker.fret} data-motion="finger"
      style={{ left, top, y: lift, rotate: roll, scaleX, scaleY, opacity, boxShadow: photoLayout ? "none" : shadow,
        ...(photoLayout ? { width: photoLayout.diameter / photoLayout.scale, height: photoLayout.diameter / photoLayout.scale, borderWidth: .35 / photoLayout.scale } : {}) }} exit={exit} aria-hidden="true">
      {!photo && <motion.span style={{ rotate: labelRotation }}>{marker.interval}</motion.span>}
    </motion.span>
    {/* Only the disk owns the exit animation; both nodes share opacity. Two
        simultaneous animations on that value cancel each other's completion. */}
    {photo && photoLayout && callout ? <>
      <motion.svg className="photo-note-leader" viewBox={`0 0 ${photoLayout.width} ${photoLayout.height}`} style={{ opacity }} aria-hidden="true">
        <motion.line x1={lineX} y1={lineY} animate={{ x2: callout.x * photoLayout.width, y2: callout.y * photoLayout.height }} transition={{ duration }} strokeWidth={.65 / photoLayout.scale} />
      </motion.svg>
      <motion.span className={`photo-note-callout ${colorClass(marker.interval)}`} initial={false}
        animate={{ left: `${callout.x * 100}%`, top: `${callout.y * 100}%` }} transition={{ duration }}
        style={{ opacity, width: 24 / photoLayout.scale, height: 20 / photoLayout.scale, fontSize: 11 / photoLayout.scale, borderRadius: 7 / photoLayout.scale, borderWidth: 1 / photoLayout.scale }} aria-hidden="true">{marker.interval}</motion.span>
    </> : photo && <motion.span className="photo-note-label" style={{ left, top, y: lift, opacity, zIndex: 6 }} aria-hidden="true">{marker.interval}</motion.span>}
  </>;
}
