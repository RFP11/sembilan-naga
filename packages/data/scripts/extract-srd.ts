// Extracts the SRD 5.2.1 PDF into tagged text lines that the build-* scripts parse.
// Output: .cache/srd.lines.txt, one line per PDF text line: "<page>\t<font size>\t<text>".
// Run: pnpm --filter @dnd/data srd:extract

import fs from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { CACHE_DIR, LINES_FILE } from "./lib";

const PDF = path.resolve(import.meta.dirname, "../../../rule-book/SRD_CC_v5.2.1.pdf");

interface Item {
  str: string;
  x: number;
  y: number;
  size: number;
  width: number;
  font: string;
  bold: boolean;
  /** The PDF had a whitespace-only item right before this one. */
  spaceBefore: boolean;
}

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(PDF)) }).promise;
const out: string[] = [];

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  await page.getOperatorList(); // loads the fonts, so their real names are known
  const content = await page.getTextContent();
  const isBold = (fontName: string) => /Bold/.test(page.commonObjs.get(fontName)?.name ?? "");
  const items: Item[] = [];
  let spaceBefore = false;
  for (const it of content.items) {
    if (!("str" in it)) continue;
    if (it.str.trim() === "") {
      spaceBefore = it.str !== "";
      continue;
    }
    items.push({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      size: Math.round(it.transform[0] * 10) / 10,
      width: it.width,
      font: it.fontName,
      bold: isBold(it.fontName),
      spaceBefore,
    });
    spaceBefore = false;
  }

  // Group consecutive items on the same baseline into lines (stream order already
  // follows the two-column reading order).
  let line: Item[] = [];
  const flush = () => {
    if (line.length) out.push(renderLine(p, line));
    line = [];
  };
  for (const it of items) {
    const last = line.at(-1);
    if (last && (Math.abs(it.y - last.y) > 2 || it.x < last.x - 1)) flush();
    line.push(it);
  }
  flush();
}

function renderLine(page: number, line: Item[]): string {
  const size = Math.max(...line.map((i) => i.size));
  const fontMax = new Map<string, number>();
  for (const it of line) fontMax.set(it.font, Math.max(fontMax.get(it.font) ?? 0, it.size));
  let text = "";
  // A line opening with bold text followed by regular text starts with a run-in label
  // ("Range:", "Benefit.", "Fire Breath (Recharge 5–6)."); mark it so the build scripts
  // can split paragraphs and fields.
  const labelEnd = line.findIndex((it) => !it.bold);
  let runIn = labelEnd > 0;
  for (let i = 0; i < line.length; i++) {
    const it = line[i]!;
    const prev = line[i - 1];
    // Small caps: the PDF draws lowercase letters as smaller capitals in the same font.
    const smallCaps = it.size < fontMax.get(it.font)! * 0.85;
    const str = smallCaps ? it.str.toLowerCase() : it.str;
    if (prev) {
      const fontChange = prev.font !== it.font;
      // The PDF often omits the space after a label.
      if (runIn && i === labelEnd) {
        runIn = false;
        if (/[.:]$/.test(text.trim())) {
          text = `**${text.trim()}** ` + str;
          continue;
        }
      }
      const gap = it.x - (prev.x + prev.width);
      // A small-caps run continues the word its capital started ("D" + "ex"), and the
      // PDF reports loose widths for those capitals.
      const continuesCap = smallCaps && !fontChange && /^[A-Z]$/.test(prev.str);
      const afterPunct = fontChange && /[.:;,]$/.test(text) && /^[A-Za-z(“]/.test(str);
      const spaced = afterPunct || (it.spaceBefore && !continuesCap);
      const minGap = continuesCap ? Infinity : spaced ? -Infinity : prev.size * 0.3;
      if (gap > minGap && !text.endsWith(" ") && !str.startsWith(" ")) text += " ";
    }
    text += str;
  }
  return `${page}\t${size}\t${text.replace(/\s+/g, " ").trim()}`;
}

fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.writeFileSync(LINES_FILE, out.join("\n") + "\n");
console.log(`wrote ${out.length} lines from ${doc.numPages} pages to ${LINES_FILE}`);
