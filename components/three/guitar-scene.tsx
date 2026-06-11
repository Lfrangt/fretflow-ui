"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, Text } from "@react-three/drei";
import { damp, damp3, dampC, dampE } from "maath/easing";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import type { NoteMarker } from "@/lib/chords";
import { markerKind } from "@/lib/chords";
import type { Finish } from "@/lib/finishes";
import { markerColors } from "@/lib/finishes";

export type Act = "intro" | "customize" | "stage";

/** Scale length in scene units. Nut at x=0, bridge at x=SCALE_LENGTH. */
const SCALE_LENGTH = 6;
const FRET_COUNT = 15;
const STRING_TOP_Y = 0.275;
const STRING_GAP = 0.11;
const MAX_MARKER_SLOTS = 6;

function fretDistance(fret: number) {
  return SCALE_LENGTH * (1 - 2 ** (-fret / 12));
}

function fretMidpoint(fret: number) {
  return (fretDistance(fret - 1) + fretDistance(fret)) / 2;
}

function stringY(string: number) {
  return STRING_TOP_Y - (string - 1) * STRING_GAP;
}

const FOV = 30;
const HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

type Pose = {
  position: [number, number, number];
  target: [number, number, number];
  rotation: [number, number, number];
};

function poseFor(act: Act, aspect: number): Pose {
  const distanceFor = (halfWidth: number, min: number, max: number) =>
    THREE.MathUtils.clamp(halfWidth / (HALF_FOV_TAN * aspect), min, max);

  if (act === "stage") {
    const z = distanceFor(2.3, 3.8, 9);
    return { position: [1.7, 0.26, z], target: [1.7, -0.04, 0], rotation: [0, 0, 0] };
  }
  if (act === "customize") {
    const z = distanceFor(6.3, 10, 18);
    return { position: [4.7, -0.1, z], target: [4.7, 0, 0], rotation: [0.14, -0.32, 0] };
  }
  const z = distanceFor(7.8, 12.5, 23);
  return { position: [2.9, 1.85, z], target: [2.9, 1.05, 0], rotation: [0.32, -0.62, -0.08] };
}

function CameraRig({ act }: { act: Act }) {
  const targetRef = useRef(new THREE.Vector3(2.7, 0.42, 0));

  useFrame((state, delta) => {
    const aspect = state.size.width / state.size.height;
    const pose = poseFor(act, aspect);
    damp3(state.camera.position, pose.position, 0.55, delta);
    damp3(targetRef.current, pose.target, 0.55, delta);
    state.camera.lookAt(targetRef.current);
  });

  return null;
}

function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 8]} intensity={1.0} />
      <directionalLight position={[-6, 2, 5]} intensity={0.3} />
      <Environment resolution={512} frames={1}>
        {/* Procedural softbox studio: no network fetch, crisp clearcoat reflections. */}
        <Lightformer intensity={2.4} position={[0, 4, 3]} rotation-x={-Math.PI / 3} scale={[14, 4, 1]} />
        <Lightformer intensity={0.9} position={[0, 0, 7]} scale={[12, 7, 1]} />
        <Lightformer intensity={1.4} position={[-7, 1, 2]} rotation-y={Math.PI / 2.6} scale={[2.5, 7, 1]} />
        <Lightformer intensity={1.1} position={[8, -1, 2]} rotation-y={-Math.PI / 2.6} scale={[2.5, 7, 1]} />
      </Environment>
    </>
  );
}

function buildBodyShape() {
  const shape = new THREE.Shape();
  shape.moveTo(3.78, 0.38);
  // Cutaway scoop up to a slim upper horn pointing back at the headstock.
  shape.bezierCurveTo(3.52, 0.42, 3.3, 0.55, 3.18, 0.8);
  shape.bezierCurveTo(3.06, 1.04, 3.18, 1.2, 3.4, 1.14);
  shape.bezierCurveTo(3.6, 1.07, 3.7, 0.88, 3.92, 0.84);
  // Upper bout swell, waist dip, lower bout.
  shape.bezierCurveTo(4.25, 1.45, 5.05, 1.45, 5.5, 1.08);
  shape.bezierCurveTo(5.85, 0.78, 6.2, 1.06, 6.7, 0.98);
  shape.bezierCurveTo(7.45, 0.82, 7.55, -0.25, 6.95, -0.78);
  shape.bezierCurveTo(6.55, -1.18, 5.3, -1.38, 4.65, -1.05);
  // Lower horn, shorter and rounder.
  shape.bezierCurveTo(4.4, -0.9, 4.18, -0.84, 3.98, -0.94);
  shape.bezierCurveTo(3.7, -1.08, 3.42, -0.95, 3.44, -0.72);
  shape.bezierCurveTo(3.46, -0.55, 3.6, -0.44, 3.78, -0.38);
  shape.lineTo(3.78, 0.38);
  return shape;
}

function buildHeadstockShape() {
  const shape = new THREE.Shape();
  shape.moveTo(0.02, 0.26);
  shape.bezierCurveTo(-0.5, 0.34, -0.95, 0.44, -1.18, 0.42);
  shape.bezierCurveTo(-1.4, 0.4, -1.4, 0.14, -1.2, 0.07);
  shape.bezierCurveTo(-1.05, 0.02, -0.95, -0.05, -0.9, -0.14);
  shape.bezierCurveTo(-0.82, -0.26, -0.5, -0.28, 0.02, -0.24);
  shape.lineTo(0.02, 0.26);
  return shape;
}

function GuitarBody({ finish }: { finish: Finish }) {
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(buildBodyShape(), {
      depth: 0.4,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.07,
      bevelSegments: 6,
      curveSegments: 48
    });
    geo.translate(0, 0, -0.49);
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (materialRef.current) dampC(materialRef.current.color, finish.body, 0.25, delta);
  });

  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial
        ref={materialRef}
        color={finish.body}
        roughness={0.28}
        metalness={0.05}
        clearcoat={1}
        clearcoatRoughness={0.12}
      />
    </mesh>
  );
}

function Headstock() {
  const geometry = useMemo(() => {
    const geo = new THREE.ExtrudeGeometry(buildHeadstockShape(), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 3,
      curveSegments: 32
    });
    geo.translate(0, 0, 0.02);
    return geo;
  }, []);

  const tunerXs = [-0.22, -0.4, -0.58, -0.76, -0.94, -1.1];

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#D9B98A" roughness={0.45} />
      </mesh>
      {tunerXs.map((x, index) => (
        <mesh key={index} position={[x, 0.24 - index * 0.013, 0.115]}>
          <cylinderGeometry args={[0.028, 0.028, 0.05, 16]} />
          <meshStandardMaterial color="#C9CCD1" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function NeckAndFretboard() {
  const fretXs = useMemo(
    () => Array.from({ length: FRET_COUNT }, (_, index) => fretDistance(index + 1)),
    []
  );
  const inlayFrets = [3, 5, 7, 9, 15];
  const boardEnd = fretDistance(FRET_COUNT) + 0.22;

  return (
    <group>
      {/* Maple neck */}
      <mesh position={[boardEnd / 2 - 0.04, 0, 0.05]}>
        <boxGeometry args={[boardEnd + 0.08, 0.62, 0.1]} />
        <meshStandardMaterial color="#D9B98A" roughness={0.45} />
      </mesh>
      {/* Rosewood board */}
      <mesh position={[boardEnd / 2, 0, 0.13]}>
        <boxGeometry args={[boardEnd, 0.66, 0.06]} />
        <meshStandardMaterial color="#2E241B" roughness={0.62} />
      </mesh>
      {/* Nut */}
      <mesh position={[0, 0, 0.145]}>
        <boxGeometry args={[0.07, 0.66, 0.075]} />
        <meshStandardMaterial color="#F3EFE2" roughness={0.4} />
      </mesh>
      {/* Frets: cylinder axis is already Y, laying across the strings */}
      {fretXs.map((x, index) => (
        <mesh key={index} position={[x, 0, 0.163]}>
          <cylinderGeometry args={[0.014, 0.014, 0.66, 12]} />
          <meshStandardMaterial color="#C9CCD1" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {/* Inlays */}
      {inlayFrets.map((fret) => (
        <mesh key={fret} position={[fretMidpoint(fret), 0, 0.161]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.012, 24]} />
          <meshStandardMaterial color="#EFEAD9" roughness={0.35} />
        </mesh>
      ))}
      {[0.16, -0.16].map((y) => (
        <mesh key={y} position={[fretMidpoint(12), y, 0.161]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.012, 24]} />
          <meshStandardMaterial color="#EFEAD9" roughness={0.35} />
        </mesh>
      ))}
      {/* Fret numbers under the board, read in the stage close-up */}
      {[3, 5, 7, 9, 12].map((fret) => (
        <Text
          key={fret}
          position={[fretMidpoint(fret), -0.52, 0.16]}
          fontSize={0.085}
          color="#A8A49B"
          anchorX="center"
          anchorY="middle"
        >
          {String(fret)}
        </Text>
      ))}
    </group>
  );
}

function Strings() {
  const radii = [0.008, 0.009, 0.011, 0.014, 0.017, 0.02];
  return (
    <group>
      {radii.map((radius, index) => (
        <mesh
          key={index}
          position={[SCALE_LENGTH / 2 - 0.05, stringY(index + 1), 0.195]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[radius, radius, SCALE_LENGTH + 0.14, 8]} />
          <meshStandardMaterial color="#D8DADF" metalness={0.95} roughness={0.28} />
        </mesh>
      ))}
    </group>
  );
}

function Hardware() {
  return (
    <group>
      {/* Pickups */}
      {[4.75, 5.45].map((x) => (
        <mesh key={x} position={[x, 0, 0.14]}>
          <boxGeometry args={[0.22, 0.6, 0.09]} />
          <meshStandardMaterial color="#1E1E20" roughness={0.5} />
        </mesh>
      ))}
      {/* Bridge */}
      <mesh position={[SCALE_LENGTH + 0.04, 0, 0.13]}>
        <boxGeometry args={[0.2, 0.72, 0.1]} />
        <meshStandardMaterial color="#B9BCC2" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* Volume knob */}
      <mesh position={[5.9, -0.78, 0.14]}>
        <cylinderGeometry args={[0.09, 0.09, 0.1, 24]} />
        <meshStandardMaterial color="#2A2A2C" roughness={0.4} />
      </mesh>
    </group>
  );
}

type Slot = {
  position: [number, number, number];
  color: string;
  label: string;
};

function MarkerDot({ slot, pulseId }: { slot: Slot | null; pulseId: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lastPulse = useRef(pulseId);
  const lastSlot = useRef<Slot | null>(slot);
  if (slot) lastSlot.current = slot;
  const display = slot ?? lastSlot.current;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !display) return;

    if (slot && lastPulse.current !== pulseId) {
      lastPulse.current = pulseId;
      if (group.scale.x > 0.5) group.scale.setScalar(1.3);
    }

    damp3(group.position, display.position, 0.18, delta);
    const targetScale = slot ? 1 : 0;
    damp(group.scale, "x", targetScale, 0.2, delta);
    group.scale.setScalar(group.scale.x);
    if (materialRef.current) dampC(materialRef.current.color, display.color, 0.2, delta);
  });

  if (!display) return null;

  return (
    <group ref={groupRef} position={display.position} scale={0}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.088, 0.088, 0.035, 32]} />
        <meshStandardMaterial ref={materialRef} color={display.color} roughness={0.32} />
      </mesh>
      <Text position={[0, 0, 0.025]} fontSize={0.066} color="#FFFFFF" anchorX="center" anchorY="middle">
        {display.label}
      </Text>
    </group>
  );
}

function Markers({ markers, pulseId }: { markers: NoteMarker[]; pulseId: number }) {
  const slots: (Slot | null)[] = Array.from({ length: MAX_MARKER_SLOTS }, (_, index) => {
    const marker = markers[index];
    if (!marker) return null;
    return {
      position: [fretMidpoint(marker.fret), stringY(marker.string), 0.26],
      color: markerColors[markerKind(marker.interval)],
      label: marker.interval
    };
  });

  return (
    <group>
      {slots.map((slot, index) => (
        <MarkerDot key={index} slot={slot} pulseId={pulseId} />
      ))}
    </group>
  );
}

function Guitar({
  act,
  finish,
  markers,
  pulseId
}: {
  act: Act;
  finish: Finish;
  markers: NoteMarker[];
  pulseId: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const aspect = state.size.width / state.size.height;
    const pose = poseFor(act, aspect);
    const time = state.clock.elapsedTime;
    const floatY = act === "intro" ? Math.sin(time * 0.5) * 0.06 : 0;
    const sway = act === "intro" ? Math.sin(time * 0.27) * 0.035 : 0;
    dampE(group.rotation, [pose.rotation[0], pose.rotation[1] + sway, pose.rotation[2]], 0.6, delta);
    damp(group.position, "y", floatY, 0.6, delta);
  });

  return (
    <group ref={groupRef}>
      <GuitarBody finish={finish} />
      <Headstock />
      <NeckAndFretboard />
      <Hardware />
      <Strings />
      <Markers markers={act === "stage" ? markers : []} pulseId={pulseId} />
    </group>
  );
}

export function GuitarScene({
  act,
  finish,
  markers,
  pulseId
}: {
  act: Act;
  finish: Finish;
  markers: NoteMarker[];
  pulseId: number;
}) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [2.7, 1.15, 11], fov: FOV }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <CameraRig act={act} />
      <StudioLights />
      <Guitar act={act} finish={finish} markers={markers} pulseId={pulseId} />
    </Canvas>
  );
}
