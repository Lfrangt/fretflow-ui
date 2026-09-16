"use client";

import { useEffect, useSyncExternalStore } from "react";
import { deleteTonePreset, getServerToneSnapshot, getToneSnapshot, initializeToneStore, saveTonePreset, setToneSettings, subscribeTone } from "@/lib/tone-store";

export function useToneRig() {
  const snapshot = useSyncExternalStore(subscribeTone, getToneSnapshot, getServerToneSnapshot);
  useEffect(initializeToneStore, []);
  return { ...snapshot, setSettings: setToneSettings, savePreset: saveTonePreset, deletePreset: deleteTonePreset };
}
