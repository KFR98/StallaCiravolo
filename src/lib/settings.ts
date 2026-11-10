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
  /** Percentuale stipendio globale sul lordo delle vendite */
  salaryPercent: 30,
  /** Lo stipendio considera le vendite al Governo */
  salaryIncludeGov: true,
  /** Lo stipendio considera le vendite dalla stalla */
  salaryIncludeStable: true,
  /** Sconto massimo applicabile (%) da ruoli non direttivi */
  maxDiscountPercent: 100,
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      try {
        s[r.key] = JSON.parse(r.value);
      } catch {
        /* valore corrotto: si usa il default */
      }
    }
  }
  return s as Settings;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return DEFAULT_SETTINGS[key];
  try {
    return JSON.parse(row.value) as Settings[K];
  } catch {
    return DEFAULT_SETTINGS[key];
  }
}
