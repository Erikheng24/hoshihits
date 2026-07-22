export type ScanMode = "sealed" | "graded" | "single";

export interface ScanFields {
  name?: string;
  set_name?: string;
  rarity?: string;
  condition?: string;
  grade_company?: string;
  grade?: string;
  cert_number?: string;
  barcode?: string;
}

/** Item type chosen at the start of the scan flow. */
export type ItemKind = "raw" | "graded" | "sealed";

/** Result of a server-side lookup (PSA cert / product UPC / card catalog). */
export interface EnrichResult {
  ok: boolean;
  source: "psa" | "upc" | "demo" | "none";
  message?: string;
  fields: ScanFields;
  image?: string; // data URL or https URL of the slab / product / card photo
  marketPrice?: number; // reference market estimate, cents
}

/** Common TCG rarity codes, longest first so "SAR" wins over "AR", "SIR" over "SR". */
const RARITY_TOKENS = [
  "QCSE", "CHR", "CSR", "SSR", "SAR", "SIR", "SEC", "RRR", "ScR",
  "AR", "SR", "UR", "HR", "RR", "SP", "FA", "AA", "PR", "UC",
];

const GRADERS: [RegExp, string][] = [
  [/\bP\.?S\.?A\b/i, "PSA"],
  [/\bB\.?G\.?S\b|BECKETT/i, "BGS"],
  [/\bC\.?G\.?C\b/i, "CGC"],
  [/\bS\.?G\.?C\b/i, "SGC"],
  [/\bA\.?C\.?E\b/i, "ACE"],
  [/\bT\.?A\.?G\b/i, "TAG"],
];

// Standalone grading/label boilerplate words (word-bounded so card-name suffixes
// like "ex"/"V" inside a name aren't wrongly stripped).
const NOISE = new RegExp(
  "\\b(" +
    [
      "GEM", "MINT", "GOOD", "POOR", "AUTHENTIC", "GRADE", "GRADED",
      "PSA", "BGS", "CGC", "SGC", "BECKETT", "POKEMON", "TCG", "TRADING",
      "HOLO", "FOIL", "REVERSE", "PROMO", "EDITION", "SERIAL", "CERT", "POP",
      "SURFACE", "CENTERING", "CORNERS", "EDGES", "SUBGRADE", "BOOSTER", "PACK",
    ].join("|") +
    ")\\b",
  "i"
);

const CONDITIONS: [RegExp, string][] = [
  [/\bGEM\b|\bMINT\b|\bGEM[\s-]*MT\b/i, "NM"],
  [/NEAR[\s-]*MINT|\bNM\b/i, "NM"],
  [/LIGHT(LY)?[\s-]*PLAYED|\bLP\b/i, "LP"],
  [/MODERATE(LY)?[\s-]*PLAYED|\bMP\b/i, "MP"],
  [/HEAVI(LY)?[\s-]*PLAYED|\bHP\b/i, "HP"],
  [/DAMAGED|\bDMG\b|\bPOOR\b/i, "DMG"],
];

/** Collector-number style tokens: 199/165, OP01-120, SV-045, 025/EN. */
const CARD_NO = /\b([A-Z]{0,4}-?\d{1,4}\s*\/\s*[A-Z0-9]{1,4}|[A-Z]{2,4}\d{1,2}-\d{1,3})\b/;

function cleanLine(s: string) {
  return s.replace(/[^A-Za-z0-9'./:&\-\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Turn raw OCR text into best-effort product fields for the given scan mode. */
export function parseScan(raw: string, mode: ScanMode): ScanFields {
  const text = raw.replace(/\r/g, "");
  const upper = text.toUpperCase();
  const lines = text.split("\n").map(cleanLine).filter((l) => l.length > 1);
  const out: ScanFields = {};

  // ---- Barcode (UPC/EAN) from OCR digits, as a fallback to the camera detector.
  // Barcodes often OCR with stray spaces ("0 820650 559860") — collapse first.
  const digitsOnly = upper.replace(/[^\d\n]/g, "");
  const barcode = digitsOnly.match(/(\d{12,13})/);
  if (barcode && mode === "sealed") out.barcode = barcode[1];

  // ---- Grader + cert + grade (graded slabs).
  if (mode === "graded") {
    for (const [re, name] of GRADERS) {
      if (re.test(upper)) { out.grade_company = name; break; }
    }
    // Cert numbers: PSA 8–9 digits, BGS/CGC ~10+. Take the longest plausible run.
    const certs = upper.match(/\b\d{7,12}\b/g) ?? [];
    if (certs.length) out.cert_number = certs.sort((a, b) => b.length - a.length)[0];
    // Numeric grade: "GEM MT 10", "MINT 9", "8.5".
    const grade =
      upper.match(/(?:GEM[\s-]*MT|MINT|GRADE|PSA|BGS|CGC|SGC)\s*(10|\d(?:\.5)?)\b/) ||
      upper.match(/\b(10|9\.5|9|8\.5|8|7\.5|7|6)\b(?=[^\d]*$)/m);
    if (grade) out.grade = grade[1];
  }

  // ---- Condition (raw singles).
  if (mode === "single") {
    for (const [re, c] of CONDITIONS) {
      if (re.test(upper)) { out.condition = c; break; }
    }
  }

  // ---- Rarity code (AR / SAR / SIR / UR …) for raw singles.
  if (mode === "single") {
    const token = RARITY_TOKENS.find((t) => new RegExp(`\\b${t}\\b`).test(upper));
    if (token) out.rarity = token;
  }

  // ---- Collector / set number (cards and slabs) — only if no rarity code took the field.
  const cardNo = text.match(CARD_NO);
  if (cardNo && mode !== "sealed" && !out.rarity) out.rarity = cardNo[1].replace(/\s+/g, "");

  // ---- Name: the strongest text line that isn't grading boilerplate.
  const nameCandidates = lines
    .filter((l) => {
      const letters = (l.match(/[A-Za-z]/g) ?? []).length;
      return letters >= 3 && letters / l.length > 0.5 && !NOISE.test(l);
    })
    // Prefer a clean alpha line (a card name rarely contains the collector number),
    // then the longest — boxes print the product name largest.
    .sort((a, b) => {
      const da = /\d/.test(a) ? 0 : 1;
      const db = /\d/.test(b) ? 0 : 1;
      return db - da || b.length - a.length;
    });
  if (nameCandidates.length) {
    out.name = nameCandidates[0]
      .split(" ")
      .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(" ")
      .slice(0, 80);
  }

  return out;
}
