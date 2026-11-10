/**
 * Lettura del file Excel del listino (foglio "LISTINO").
 * Usato sia dallo script di importazione iniziale (CLI) sia dalla pagina admin.
 * Non inventa dati: segnala ogni anomalia e applica solo le correzioni
 * esplicitamente previste (refusi nei nomi, celle vuote ricalcolabili dalla formula del file).
 */
import ExcelJS from "exceljs";

export type ParsedPrices = {
  govListPrice: number | null;
  basePriceA: number | null;
  basePriceB: number | null;
  trainingPrice: number | null;
  salePriceA: number | null;
  salePriceB: number | null;
  governmentPrice: number | null;
};

export type ParsedRow = {
  row: number;
  breedOriginal: string;
  breedName: string;
  coatOriginal: string;
  coatName: string;
  isCustom: boolean;
  prices: ParsedPrices;
  stats: Record<string, number | null>;
};

export type Anomaly = {
  row: number | null;
  level: "info" | "warning" | "error";
  message: string;
};

export type ParsedListino = {
  sheetNames: string[];
  statColumns: { key: string; label: string }[];
  rows: ParsedRow[];
  anomalies: Anomaly[];
  ignoredSheets: string[];
  breeds: { name: string; isCustom: boolean; coats: number }[];
};

/** Razze presenti in Red Dead Redemption 2 / Red Dead Online (chiave normalizzata). */
const OFFICIAL_BREEDS = [
  "AMERICAN PAINT", "AMERICAN STANDARD", "ANDALUSIAN", "APPALOOSA", "ARABIAN", "ARDENNES",
  "BELGIAN", "BRETON", "BRETONE", "CRIOLLO", "DUTCH WARMBLOOD", "GYPSY COB", "HUNGARIAN",
  "KENTUCKY SADDLE", "KLADRUBER", "MISSOURI FOX TROTTER", "MORGAN", "MUSTANG", "NOKOTA",
  "NORFOLK ROADSTER", "SHIRE", "SUFFOLK PUNCH", "TENNESSEE WALKER", "THOROUGHBRED", "TURKOMAN",
  "MULI", "ASINI", "MULE", "DONKEY",
];

/** Correzioni di refusi evidenti nei nomi delle razze (originale normalizzato → corretto). */
const BREED_FIXES: Record<string, string> = {
  "NORFOLK ROADSTE": "NORFOLK ROADSTER",
  "TENNESSE WALKER": "TENNESSEE WALKER",
  SUFFOLKPUNCH: "SUFFOLK PUNCH",
  GYPSYCOB: "GYPSY COB",
};

/** Correzioni di refusi evidenti nei nomi dei manti. */
const COAT_FIXES: Record<string, string> = {
  Blancket: "Blanket",
  "Ligth Grey": "Light Grey",
  "Reverse Daplle Black": "Reverse Dapple Black",
  "Splashed Piebland": "Splashed Piebald",
  "White Blangdon": "White Blagdon",
  "Palomino Blagdon": "Palomino Blagdon",
  IronGreyRoan: "Iron Grey Roan",
  StrawberryRoan: "Strawberry Roan",
  Bayroan: "Bay Roan",
  FlaxenChestnut: "Flaxen Chestnut",
  SpeckledGrey: "Speckled Grey",
  EagleFlies: "Eagle Flies",
};

const HEADER_ALIASES: Record<string, keyof ParsedPrices | "breed" | "coat"> = {
  RAZZA: "breed",
  MANTO: "coat",
  "5-10 ANNI": "basePriceA",
  "11-15 ANNI": "basePriceB",
  "11-16 ANNI": "basePriceB",
  "ADDEST.": "trainingPrice",
  ADDEST: "trainingPrice",
  "LISTINO GOV": "govListPrice",
  "TOT 5-10 ANNI": "salePriceA",
  "TOT 11-16 ANNI": "salePriceB",
  "TOT 11-15 ANNI": "salePriceB",
  GOVERNO: "governmentPrice",
};

const PRICE_LABELS: Record<keyof ParsedPrices, string> = {
  govListPrice: "LISTINO GOV",
  basePriceA: "5-10 ANNI",
  basePriceB: "11-15 ANNI",
  trainingPrice: "ADDEST.",
  salePriceA: "TOT 5-10 ANNI",
  salePriceB: "TOT 11-16 ANNI",
  governmentPrice: "GOVERNO",
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const ceil5 = (v: number) => Math.ceil(Math.round(v * 1000) / 1000 / 5) * 5;
const round2 = (v: number) => Math.round(v * 100) / 100;

function cellRaw(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result;
    if ("formula" in o || "sharedFormula" in o) return undefined;
    if ("richText" in o && Array.isArray(o.richText))
      return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("error" in o) return { error: o.error };
  }
  return v;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cellRaw(cell);
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return "";
  return norm(String(v));
}

/** Restituisce numero, null se vuota, oppure "error" se cella in errore/non numerica. */
function cellNumber(cell: ExcelJS.Cell): number | null | "error" {
  const v = cellRaw(cell);
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return round2(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? round2(n) : "error";
  }
  return "error";
}

function statKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function isOfficialBreed(name: string) {
  const n = name.toUpperCase().replace(/\(.*?\)/g, "").trim();
  return OFFICIAL_BREEDS.some((b) => n === b || n.startsWith(b + " ") || n.startsWith(b));
}

export async function parseListino(buffer: ArrayBuffer | Buffer): Promise<ParsedListino> {
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);
  const anomalies: Anomaly[] = [];
  const sheetNames = wb.worksheets.map((w) => w.name);
  const ws = wb.worksheets.find((w) => w.name.trim().toUpperCase() === "LISTINO") ?? wb.worksheets[0];
  if (!ws) throw new Error("Il file non contiene fogli.");

  // 1. Trova la riga di intestazione (quella con "RAZZA")
  let headerRow = -1;
  let breedCol = -1;
  for (let r = 1; r <= Math.min(ws.rowCount, 20) && headerRow < 0; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) {
      if (cellText(row.getCell(c)).toUpperCase() === "RAZZA") {
        headerRow = r;
        breedCol = c;
        break;
      }
    }
  }
  if (headerRow < 0) throw new Error('Intestazione "RAZZA" non trovata nel foglio ' + ws.name);

  const colMap = new Map<number, keyof ParsedPrices | "breed" | "coat">();
  const statColumns: { col: number; key: string; label: string }[] = [];
  let afterGoverno = false;
  const hdr = ws.getRow(headerRow);
  for (let c = breedCol; c <= Math.min(ws.columnCount, 60); c++) {
    const label = cellText(hdr.getCell(c));
    if (!label) {
      if (afterGoverno) break;
      continue;
    }
    const alias = HEADER_ALIASES[label.toUpperCase()];
    if (alias && !afterGoverno) {
      colMap.set(c, alias);
      if (alias === "governmentPrice") afterGoverno = true;
    } else if (afterGoverno) {
      statColumns.push({ col: c, key: statKey(label), label });
    } else {
      anomalies.push({ row: headerRow, level: "warning", message: `Colonna non riconosciuta e ignorata: "${label}"` });
    }
  }
  const required: (keyof ParsedPrices | "coat")[] = ["coat", "govListPrice", "salePriceA", "salePriceB", "governmentPrice"];
  for (const req of required) {
    if (![...colMap.values()].includes(req)) throw new Error(`Colonna obbligatoria mancante: ${req === "coat" ? "MANTO" : PRICE_LABELS[req]}`);
  }
  const headerLabel = (k: string) => {
    for (const c of colMap.keys()) if (colMap.get(c) === k) return cellText(hdr.getCell(c));
    return k;
  };
  if (headerLabel("basePriceB").includes("15") && headerLabel("salePriceB").includes("16")) {
    anomalies.push({
      row: headerRow,
      level: "info",
      message: `Intestazioni incoerenti: "${headerLabel("basePriceB")}" e "${headerLabel("salePriceB")}". Le fasce d'età sono configurabili nelle impostazioni.`,
    });
  }

  // 2. Righe dati: dalla riga dopo l'intestazione fino alla prima riga vuota
  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const breedOriginal = cellText(row.getCell(breedCol));
    let coatOriginal = "";
    for (const [c, k] of colMap) if (k === "coat") coatOriginal = cellText(row.getCell(c));
    if (!breedOriginal && !coatOriginal) break; // fine tabella (le righe successive non sono listino)
    if (!breedOriginal || !coatOriginal) {
      anomalies.push({ row: r, level: "error", message: `Riga incompleta (razza "${breedOriginal}", manto "${coatOriginal}"): ignorata.` });
      continue;
    }

    const rawBreed = row.getCell(breedCol).value;
    if (typeof rawBreed === "string" && rawBreed !== rawBreed.trim()) {
      anomalies.push({ row: r, level: "info", message: `Spazi superflui nel nome razza "${rawBreed}" rimossi.` });
    }
    let breedName = breedOriginal.toUpperCase();
    if (BREED_FIXES[breedName]) {
      anomalies.push({ row: r, level: "info", message: `Nome razza corretto: "${breedOriginal}" → "${BREED_FIXES[breedName]}".` });
      breedName = BREED_FIXES[breedName];
    } else breedName = breedOriginal;
    let coatName = coatOriginal;
    if (COAT_FIXES[coatName] && COAT_FIXES[coatName] !== coatName) {
      anomalies.push({ row: r, level: "info", message: `Nome manto corretto: "${coatOriginal}" → "${COAT_FIXES[coatName]}" (${breedName}).` });
      coatName = COAT_FIXES[coatName];
    }

    const prices: ParsedPrices = {
      govListPrice: null, basePriceA: null, basePriceB: null, trainingPrice: null,
      salePriceA: null, salePriceB: null, governmentPrice: null,
    };
    for (const [c, k] of colMap) {
      if (k === "breed" || k === "coat") continue;
      const v = cellNumber(row.getCell(c));
      if (v === "error") {
        anomalies.push({ row: r, level: "warning", message: `${breedName} – ${coatName}: valore non valido in "${PRICE_LABELS[k]}".` });
        prices[k] = null;
      } else prices[k] = v;
    }

    // Correzioni previste: celle vuote ricalcolabili con la formula del file stesso
    const G = prices.govListPrice;
    if (G != null) {
      const expected = {
        basePriceA: ceil5(G * 0.5),
        basePriceB: ceil5(G * 0.4),
        trainingPrice: ceil5(G * 0.1),
      };
      for (const k of ["basePriceA", "basePriceB", "trainingPrice"] as const) {
        if (prices[k] == null && colMap.size && [...colMap.values()].includes(k)) {
          prices[k] = expected[k];
          anomalies.push({
            row: r,
            level: "warning",
            message: `${breedName} – ${coatName}: "${PRICE_LABELS[k]}" vuoto, ricalcolato con la formula del file = ${expected[k]}.`,
          });
        } else if (prices[k] != null && prices[k] !== expected[k]) {
          anomalies.push({
            row: r,
            level: "info",
            message: `${breedName} – ${coatName}: "${PRICE_LABELS[k]}" = ${prices[k]} diverso dalla formula (${expected[k]}). Mantenuto il valore del file.`,
          });
        }
      }
      if (prices.salePriceA == null && prices.basePriceA != null && prices.trainingPrice != null) {
        prices.salePriceA = prices.basePriceA + prices.trainingPrice;
        anomalies.push({ row: r, level: "warning", message: `${breedName} – ${coatName}: "TOT 5-10 ANNI" in errore, ricalcolato = ${prices.salePriceA}.` });
      }
      if (prices.salePriceB == null && prices.basePriceB != null && prices.trainingPrice != null) {
        prices.salePriceB = prices.basePriceB + prices.trainingPrice;
        anomalies.push({ row: r, level: "warning", message: `${breedName} – ${coatName}: "TOT 11-16 ANNI" in errore, ricalcolato = ${prices.salePriceB}.` });
      }
      const gov = round2(G * 0.03);
      if (prices.governmentPrice != null && Math.abs(prices.governmentPrice - gov) > 0.01) {
        anomalies.push({
          row: r,
          level: "info",
          message: `${breedName} – ${coatName}: GOVERNO = ${prices.governmentPrice} (la formula del file darebbe ${gov}). Mantenuto il valore del file.`,
        });
      }
    } else {
      anomalies.push({ row: r, level: "warning", message: `${breedName} – ${coatName}: LISTINO GOV mancante.` });
    }

    const stats: Record<string, number | null> = {};
    for (const s of statColumns) {
      const v = cellNumber(row.getCell(s.col));
      if (v === "error") {
        anomalies.push({ row: r, level: "warning", message: `${breedName} – ${coatName}: statistica "${s.label}" non valida, lasciata vuota.` });
        stats[s.key] = null;
      } else {
        stats[s.key] = v;
        if (v == null) anomalies.push({ row: r, level: "warning", message: `${breedName} – ${coatName}: statistica "${s.label}" mancante.` });
      }
    }

    const dupKey = (breedName + "|" + coatName).toUpperCase();
    if (seen.has(dupKey)) {
      anomalies.push({ row: r, level: "error", message: `Duplicato di riga ${seen.get(dupKey)}: ${breedName} – ${coatName}. Ignorato.` });
      continue;
    }
    seen.set(dupKey, r);

    rows.push({
      row: r,
      breedOriginal,
      breedName,
      coatOriginal,
      coatName,
      isCustom: !isOfficialBreed(breedName),
      prices,
      stats,
    });
  }

  const breedsMap = new Map<string, { name: string; isCustom: boolean; coats: number }>();
  for (const r of rows) {
    const b = breedsMap.get(r.breedName) ?? { name: r.breedName, isCustom: r.isCustom, coats: 0 };
    b.coats++;
    breedsMap.set(r.breedName, b);
  }
  for (const b of breedsMap.values()) {
    if (b.isCustom)
      anomalies.push({ row: null, level: "info", message: `Razza personalizzata/mod rilevata: ${b.name} (${b.coats} manti).` });
  }

  const ignoredSheets = sheetNames.filter((n) => n !== ws.name);
  return {
    sheetNames,
    statColumns: statColumns.map(({ key, label }) => ({ key, label })),
    rows,
    anomalies,
    ignoredSheets,
    breeds: [...breedsMap.values()],
  };
}
