import { NextResponse } from "next/server";
import { analyzeAudio, AudioEngineError, type EngineResponse } from "./audio-engines";

export const maxDuration = 300;

function normalizeChordLabel(value: string) {
  const chord = value.trim();

  if (!chord || chord === "N" || chord === "N.C.") return "N.C.";

  return chord
    .replace(":maj", "maj")
    .replace(":min", "m")
    .replace(":dim", "dim")
    .replace(":aug", "aug")
    .replace(":7", "7")
    .replace(":sus4", "sus4")
    .replace(":sus2", "sus2")
    .replace("majmaj", "maj")
    .replace(/maj(?!7|9|11|13)$/i, "")
    .replace("min", "m")
    .replace(/[()]/g, "");
}

function compactProgression(chords: string[]) {
  return chords.filter((chord, index) => chord !== "N.C." && chord !== chords[index - 1]);
}

function buildSections(chords: string[]) {
  const compact = compactProgression(chords);
  const bars = Array.from({ length: Math.ceil(compact.length / 2) }, (_, index) =>
    compact.slice(index * 2, index * 2 + 2)
  ).filter((bar) => bar.length > 0);

  return [
    {
      name: "Detected progression",
      bars: bars.length ? bars : [["N.C."]]
    }
  ];
}

function toAnalysisResult(engineResult: EngineResponse, file: File) {
  const normalizedChords = (engineResult.chords ?? [])
    .map((entry) => normalizeChordLabel(entry.chord ?? entry.label ?? "N.C."))
    .filter(Boolean);
  const compact = compactProgression(normalizedChords);
  const confidences = (engineResult.chords ?? [])
    .map((entry) => entry.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0.72;

  return {
    source: "MP3 analysis",
    title: file.name.replace(/\.[^.]+$/, "") || "Uploaded song",
    key: engineResult.key ?? "Detected",
    bpm: engineResult.bpm ?? 82,
    confidence: Math.max(0, Math.min(1, averageConfidence)),
    progression: compact.join("  "),
    sections: buildSections(normalizedChords),
    engine: {
      model: engineResult.model_name ?? engineResult.model_used ?? "Chord recognition worker",
      chordDict: engineResult.chord_dict ?? "auto",
      duration: engineResult.duration ?? null,
      provider: engineResult.provider ?? "audio-engine"
    }
  };
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Upload an MP3 file as multipart form data with the field name `audio`." },
      { status: 400 }
    );
  }

  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json(
      { message: "No MP3 file received. Upload an audio file before running FretFlow analysis." },
      { status: 400 }
    );
  }

  try {
    const payload = await analyzeAudio(audio);

    return NextResponse.json({
      message: "FretFlow audio analysis complete.",
      result: toAnalysisResult(payload, audio),
      raw: payload.raw ?? payload
    });
  } catch (error) {
    if (error instanceof AudioEngineError) {
      return NextResponse.json(
        {
          message: error.message,
          result: null
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? `FretFlow audio engine request failed: ${error.message}`
            : "FretFlow audio engine request failed.",
        result: null
      },
      { status: 503 }
    );
  }
}
