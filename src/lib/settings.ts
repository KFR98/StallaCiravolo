import { prisma } from "./db";

/** Impostazioni globali con valori predefiniti. Tutte modificabili dall'admin. */
export const DEFAULT_SETTINGS = {
  stableName: "Stalla Ciravolo",
  /** Giorni reali necessari per far avanzare l'età di un anno */
  daysPerYear: 4,
  /** Età minima per vendere un cavallo dalla stalla */
  minSaleAge: 5,
  /** Fascia A (prezzo "TOT 5-10 ANNI"): fino a questa età inclusa */
  bracketAMax: 10,
  /** Fascia B (prezzo "TOT 11-16 ANNI"): fino a questa età inclusa; oltre = prezzo libero */
  bracketBMax: 16,
  /** Età proposta di default nel modulo di cattura */
  defaultCaptureAge: 1,
  /** Percentuale stipendio sulle vendite dalla stalla */
  pctStable: 30,
  /** Percentuale stipendio sulle vendite al blip del Governo */
  pctGov: 30,
  /** Percentuale stipendio sulle vendite di oggetti della bottega */
  pctItems: 0,
  /** Sconto massimo applicabile (%) da ruoli non direttivi */
  maxDiscountPercent: 100,
  /** Giorni di gravidanza prima dello stato "Fai partorire" */
  pregnancyDays: 3,
  /** Backup automatico attivo */
  backupAuto: true,
  /** Ogni quante ore viene creato un backup automatico */
  backupEveryHours: 24,
  /** Giorni di conservazione dei backup */
  backupDays: 14,
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const raw = new Map<string, unknown>();
  for (const r of rows) {
    try {
      raw.set(r.key, JSON.parse(r.value));
    } catch {
      /* valore corrotto: si usa il default */
    }
  }
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  // Compatibilità con la versione precedente (percentuale unica)
  if (raw.has("salaryPercent")) {
    const old = Number(raw.get("salaryPercent"));
    if (!raw.has("pctStable")) s.pctStable = raw.get("salaryIncludeStable") === false ? 0 : old;
    if (!raw.has("pctGov")) s.pctGov = raw.get("salaryIncludeGov") === false ? 0 : old;
  }
  for (const [k, v] of raw) if (k in DEFAULT_SETTINGS) s[k] = v;
  return s as Settings;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}
