import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { loadNotationEngine } from "./notation-engine";
import { paginateBlocks } from "./pdf-layout";
import type { Transcription } from "./transcription";

export type PdfLayout = "chords" | "scoretab" | "score" | "tab";
type Copy = { title: string; notice: string; time: string; chord: string; degree: string; review: string; edited: string; estimate: string; source: string; duration: string };
const WIDTH = 700;
const PAGE = [595.28, 841.89] as const;
const MARGIN = 36;
const CONTENT = PAGE[0] - 2 * MARGIN;

export function saveExport(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function canvas(height: number) {
  const element = document.createElement("canvas");
  element.width = WIDTH * 2; element.height = Math.ceil(height * 2);
  const context = element.getContext("2d");
  if (!context) throw new Error("PDF export is unavailable in this browser.");
  context.scale(2, 2); context.fillStyle = "white"; context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = "#172326"; context.textBaseline = "top";
  return { element, context };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []; let line = "";
  for (const character of text) {
    if (character === "\n") { lines.push(line); line = ""; continue; }
    if (line && ctx.measureText(line + character).width > width) {
      const space = line.lastIndexOf(" ");
      if (space > line.length / 2) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
      else { lines.push(line); line = ""; }
    }
    if (character !== "\n") line += character;
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(title: string, lines: string[]) {
  const { context: measure } = canvas(1);
  measure.font = "14px Arial, sans-serif";
  const wrapped = lines.flatMap(line => wrap(measure, line, WIDTH - 32));
  const titleLines = (() => { measure.font = "bold 23px Arial, sans-serif"; return wrap(measure, title, WIDTH - 32); })();
  const { element, context } = canvas(28 + titleLines.length * 29 + wrapped.length * 20);
  context.font = "bold 23px Arial, sans-serif";
  titleLines.forEach((line, i) => context.fillText(line, 16, 8 + i * 29));
  context.font = "14px Arial, sans-serif";
  wrapped.forEach((line, i) => context.fillText(line, 16, 18 + titleLines.length * 29 + i * 20));
  return element;
}

function timestamp(value: number) { return `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, "0")}`; }

function chordBlocks(result: Transcription, copy: Copy) {
  return result.chords.map((chord, i) => {
    const { element, context } = canvas(38);
    if (i % 2 === 0) { context.fillStyle = "#f0f4f3"; context.fillRect(0, 0, WIDTH, 38); }
    context.fillStyle = "#172326"; context.font = "13px Arial, sans-serif";
    context.fillText(`${timestamp(chord.start)} - ${timestamp(chord.end)}`, 16, 12);
    context.font = "bold 16px Arial, sans-serif"; context.fillText(chord.label, 210, 10, 180);
    context.font = "14px Arial, sans-serif"; context.fillText(chord.roman || "-", 410, 11, 90);
    context.font = "12px Arial, sans-serif";
    context.fillText(chord.edited ? copy.edited : chord.review ? copy.review : copy.estimate, 520, 12, 165);
    return element;
  });
}

function chordHeading(copy: Copy) {
  const { element, context } = canvas(34);
  context.font = "bold 13px Arial, sans-serif";
  for (const [label, x] of [[copy.time, 16], [copy.chord, 210], [copy.degree, 410], [copy.review, 520]] as const) context.fillText(label, x, 9);
  return element;
}

let fontReady: Promise<void> | undefined;
function musicFont() {
  if (!fontReady) fontReady = (async () => {
    const font = new FontFace("alphaTab", 'url("/alphatab/font/Bravura.woff2")');
    await font.load(); document.fonts.add(font);
  })().catch(error => { fontReady = undefined; throw error; });
  return fontReady;
}

async function scoreModel(xml: string, notice: string) {
  const engine = await loadNotationEngine();
  const settings = new engine.Settings();
  const score = engine.importer.ScoreLoader.loadScoreFromBytes(new TextEncoder().encode(xml), settings);
  score.subTitle = "Beta - for reference only"; score.notices = notice; score.instructions = notice;
  const ottava = Number(Object.entries(engine.model.Ottavia).find(([, name]) => name === "_8vb")?.[0]);
  if (!Number.isInteger(ottava)) throw new Error("Guitar octave clef is unavailable");
  for (const track of score.tracks) {
    track.playbackInfo.program = 24;
    for (const staff of track.staves) {
      staff.showStandardNotation = true; staff.showTablature = true;
      staff.standardNotationLineCount = 5; staff.displayTranspositionPitch = 0;
      for (const bar of staff.bars) bar.clefOttava = ottava;
    }
  }
  return { engine, settings, score };
}

export async function guitarProBytes(xml: string, notice: string) {
  const { engine, score } = await scoreModel(xml, notice);
  return new engine.exporter.Gp7Exporter().export(score);
}

async function notationBlocks(xml: string, layout: Exclude<PdfLayout, "chords">, notice: string) {
  const { engine, settings, score } = await scoreModel(xml, notice);
  await musicFont();
  settings.core.engine = "html5"; settings.core.enableLazyLoading = false;
  settings.display.layoutMode = engine.LayoutMode.Page;
  settings.display.staveProfile = layout === "score" ? engine.StaveProfile.Score : layout === "tab" ? engine.StaveProfile.Tab : engine.StaveProfile.ScoreTab;
  settings.display.scale = .8;
  // The runtime exposes this font resource through JSON; it is internal in its TS declarations.
  settings.fillFromJson({ display: { resources: { smuflFontFamilyName: "alphaTab" } } } as Parameters<typeof settings.fillFromJson>[0]);
  const renderer = new engine.rendering.ScoreRenderer(settings);
  renderer.width = WIDTH;
  return new Promise<HTMLCanvasElement[]>((resolve, reject) => {
    const parts = new Map<string, { y: number; image: HTMLCanvasElement }>();
    const timer = setTimeout(() => { renderer.destroy(); reject(new Error("PDF rendering timed out. Please try again.")); }, 30_000);
    renderer.partialRenderFinished.on(part => {
      if (part.renderResult instanceof HTMLCanvasElement) parts.set(part.id, { y: part.y, image: part.renderResult });
    });
    renderer.error.on(error => { clearTimeout(timer); renderer.destroy(); reject(error); });
    renderer.postRenderFinished.on(() => {
      clearTimeout(timer); renderer.destroy();
      const blocks = [...parts.values()].sort((a, b) => a.y - b.y).map(part => part.image);
      if (!blocks.length) reject(new Error("The score could not be rendered.")); else resolve(blocks);
    });
    try { renderer.renderScore(score, score.tracks.map((_, index) => index)); } catch (error) { clearTimeout(timer); renderer.destroy(); reject(error); }
  });
}

export async function transcriptionPdf(result: Transcription, layout: PdfLayout, xml: string | null, copy: Copy) {
  const body = layout === "chords" ? chordBlocks(result, copy) : await notationBlocks(xml!, layout, copy.notice);
  if (!body.length) throw new Error("No content to export.");
  const header = textBlock(copy.title, [result.name, `${copy.source}: ${timestamp(result.clip_start || 0)} | ${copy.duration}: ${timestamp(result.duration)}`, copy.notice]);
  const columnHeader = layout === "chords" ? chordHeading(copy) : null;
  const repeat = columnHeader ? [header, columnHeader] : [header];
  const height = (image: HTMLCanvasElement) => image.height / image.width * CONTENT;
  const headerHeight = repeat.reduce((sum, block) => sum + height(block), 0);
  const pages = paginateBlocks(body.map(height), PAGE[1] - 2 * MARGIN - 24 - headerHeight);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${result.name} - ${copy.title}`); pdf.setSubject(copy.notice); pdf.setCreator("FretFlow");
  const footerFont = await pdf.embedFont(StandardFonts.Helvetica);
  const headerImages = await Promise.all(repeat.map(block => pdf.embedPng(block.toDataURL("image/png"))));
  for (const [pageIndex, indices] of pages.entries()) {
    const page = pdf.addPage([...PAGE]); let y = PAGE[1] - MARGIN;
    for (const [index, block] of repeat.entries()) { const h = height(block); y -= h; page.drawImage(headerImages[index], { x: MARGIN, y, width: CONTENT, height: h }); }
    for (const index of indices) {
      const block = body[index]; const h = height(block); y -= h;
      const image = await pdf.embedPng(block.toDataURL("image/png"));
      page.drawImage(image, { x: MARGIN, y, width: CONTENT, height: h });
    }
    page.drawText(`FretFlow | ${pageIndex + 1} / ${pages.length}`, { x: MARGIN, y: 22, size: 9, font: footerFont, color: rgb(.35, .4, .4) });
  }
  return pdf.save();
}
