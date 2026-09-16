/** Place whole systems/rows on pages; never cut a staff or a chord row in half. */
export function paginateBlocks(heights: number[], available: number): number[][] {
  if (!(available > 0) || heights.some(h => !Number.isFinite(h) || h <= 0 || h > available)) {
    throw new Error("PDF content does not fit on the page.");
  }
  const pages: number[][] = [];
  let used = 0;
  for (const [index, height] of heights.entries()) {
    if (!pages.length || used + height > available) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(index); used += height;
  }
  return pages;
}
