// Shared helpers for the SRD build scripts.

import fs from "node:fs";
import path from "node:path";

export const CACHE_DIR = path.resolve(import.meta.dirname, "../.cache");
export const LINES_FILE = path.join(CACHE_DIR, "srd.lines.txt");
export const SRD_DIR = path.resolve(import.meta.dirname, "../src/srd");

export interface Line {
  page: number;
  size: number;
  text: string;
}

export function readLines(): Line[] {
  if (!fs.existsSync(LINES_FILE)) {
    throw new Error(`${LINES_FILE} not found; run "pnpm --filter @dnd/data srd:extract" first`);
  }
  return fs
    .readFileSync(LINES_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [page, size, text = ""] = l.split("\t");
      return { page: Number(page), size: Number(size), text };
    })
    .filter((l) => !isPageChrome(l));
}

/** Running header/footer: "System Reference Document 5.2.1" and the page number. */
function isPageChrome(l: Line): boolean {
  return l.size === 11 && /^(\d+ ?)?System Reference Document 5\.2\.1( ?\d+)?$|^\d+$/.test(l.text);
}

/** Lines from the first line matching `start` up to (not including) the first matching `end`. */
export function section(
  lines: Line[],
  start: (l: Line) => boolean,
  end: (l: Line) => boolean,
): Line[] {
  const from = lines.findIndex(start);
  if (from < 0) throw new Error("section start not found");
  const to = lines.findIndex((l, i) => i > from && end(l));
  return lines.slice(from, to < 0 ? undefined : to);
}

/** Joins wrapped lines into paragraphs, re-joining words hyphenated across lines. */
export function joinText(lines: string[]): string {
  let out = "";
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (!out) out = t;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(t)) out = out.slice(0, -1) + t;
    else if (/\d-$/.test(out))
      out += t; // "40-" + "foot radius"
    else out += " " + t;
  }
  return out;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(SRD_DIR, { recursive: true });
  const target = path.join(SRD_DIR, file);
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `wrote ${Array.isArray(data) ? data.length + " entries" : "data"} to src/srd/${file}`,
  );
}

/**
 * Joins wrapped lines into Markdown paragraphs. A line opening with a run-in label
 * ("**Range:**") starts a new paragraph, as does a short line ending a sentence.
 */
export function paragraphs(lines: (string | Line)[]): string {
  const paras: { table: boolean; lines: string[] }[] = [];
  let prev = "";
  for (const raw of lines) {
    let t = (typeof raw === "string" ? raw : raw.text).trim().replace(/^• /, "- ");
    if (!t) continue;
    // Table title (10.5), header (9.3) and rows (9.5) keep one line each as a list.
    const size = typeof raw === "string" ? 10 : raw.size;
    const table = size === 10.5 || size === 9.3 || size === 9.5;
    if (table) {
      if (size === 10.5) t = `**${t}**`;
      else if (size === 9.3) t = `*${t}*`;
      else t = `- ${t}`;
      if (paras.at(-1)?.table && /^- [a-z]/.test(t) && size === 9.5) {
        // a wrapped row: lowercase start continues the previous row
        const p = paras.at(-1)!.lines;
        const last = p[p.length - 1]!;
        p[p.length - 1] = /[a-z]-$/.test(last)
          ? last.slice(0, -1) + t.slice(2)
          : `${last} ${t.slice(2)}`;
      } else if (paras.at(-1)?.table) paras.at(-1)!.lines.push(t);
      else paras.push({ table: true, lines: [t] });
      prev = "";
      continue;
    }
    const prevEnded = (/[.:!?)”]$/.test(prev) && prev.length < 42) || /^\*\*[^*]+\*\*$/.test(prev);
    if (
      !paras.length ||
      paras.at(-1)!.table ||
      t.startsWith("**") ||
      t.startsWith("- ") ||
      prevEnded
    ) {
      paras.push({ table: false, lines: [] });
    }
    paras.at(-1)!.lines.push(t);
    prev = t;
  }
  return paras.map((p) => (p.table ? p.lines.join("\n") : joinText(p.lines))).join("\n\n");
}

/** Splits "**Name.** text" into its parts, or returns undefined for an unlabeled line. */
export function runIn(text: string): { name: string; rest: string } | undefined {
  const m = /^\*\*(.+?)[.:]\*\*\s*(.*)$/s.exec(text);
  return m ? { name: m[1]!, rest: m[2]! } : undefined;
}

/** "1,500 GP" / "5 SP" / "2 CP" → copper pieces. */
export function parseCost(text: string): number {
  const m = /^([\d,]+)\s*(CP|SP|EP|GP|PP)$/i.exec(text.trim());
  if (!m) throw new Error(`unparseable cost: "${text}"`);
  const n = Number(m[1]!.replace(/,/g, ""));
  return n * { CP: 1, SP: 10, EP: 50, GP: 100, PP: 1000 }[m[2]!.toUpperCase() as "CP"];
}

/** "1/4 lb." / "18 lb." / "—" → pounds. */
export function parseWeight(text: string): number {
  const t = text.trim();
  if (t === "—") return 0;
  // "1/4 lb.", "58½ lb.", "5 lb. (full)"
  const m = /^(\d+)(½)?(?:\/(\d+))?\s*lb\.(?: \(full\))?$/.exec(t);
  if (!m) throw new Error(`unparseable weight: "${text}"`);
  return (m[3] ? Number(m[1]) / Number(m[3]) : Number(m[1])) + (m[2] ? 0.5 : 0);
}

/** All lines of a chapter (size-26 title) up to the next chapter title. */
export function chapter(lines: Line[], title: string): Line[] {
  return section(
    lines,
    (l) => l.size === 26 && l.text === title,
    (l) => l.size === 26,
  );
}

/**
 * Pulls titled tables (a size-10.5 title plus its 9.3/9.5 rows) out of the text flow.
 * The PDF places some tables at the foot of a page, inside an unrelated entry; callers
 * re-attach each one where the text names it ("... the Elven Lineages table").
 */
export function extractTables(lines: Line[]): { rest: Line[]; tables: Map<string, Line[]> } {
  const rest: Line[] = [];
  const tables = new Map<string, Line[]>();
  let current: Line[] | undefined;
  for (const l of lines) {
    if (l.size === 10.5) tables.set(l.text, (current = [l]));
    else if (current && (l.size === 9.3 || l.size === 9.5)) current.push(l);
    else {
      current = undefined;
      rest.push(l);
    }
  }
  return { rest, tables };
}
