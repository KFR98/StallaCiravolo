import { prisma } from "./db";

/** Impostazioni globali con valori predefiniti. Tutte modificabili dall'admin. */
export const DEFAULT_SETTINGS = {
  stableName: "Stalla Ciravolo",
  /** Link d'invito al server Discord (logo nel menu e nella pagina di accesso). Vuoto = logo nascosto */
  discordUrl: "https://discord.com/invite/fkf4nVN2Fm",
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
  /** Parti massimi per cavalla */
  maxFoals: 3,
  /** Un cavallo è "puledro" finché ha meno di questi anni (nato in stalla o catturato) */
  foalMaxAge: 5,
  /** Cavalli rari e leggendari: prezzo base di riferimento (il venditore lo può cambiare) e addestramento */
  rareBasePrice: 2000,
  rareTrainingPrice: 250,
  /** Colori di rari e leggendari (card, badge, punti sulla mappa) */
  rareColor: "#7c3aed",
  legendaryColor: "#c99a1c",
  /** Catture: di quanti giorni si può retrodatare (dipendenti / chi corregge i dati) */
  captureBackdateDays: 30,
  captureBackdateDaysAdmin: 365,
  /** Puledri: quanto indietro si può impostare la data di nascita (giorni) */
  foalBirthMaxDays: 365,
  /** Vendita: oggetti della bottega usati come "4 ferri normali" e "4 ferri migliorati" (0 = riconosci dal nome) */
  shoeClassicItemId: 0,
  shoeImprovedItemId: 0,
  /** Stalliere della settimana: punti */
  scoreCapture: 1,
  scoreStableSale: 3,
  scoreGovSale: 1,
  scoreItemSale: 1,
  scorePer100: 1,
  /** Sicurezza: tentativi di accesso sbagliati prima del blocco e durata del blocco */
  loginMaxAttempts: 5,
  loginLockMinutes: 5,
  loginMaxAttemptsUser: 20,
  loginUserLockMinutes: 15,
  /** Sicurezza: durata della sessione (giorni), si rinnova da sola se usata */
  sessionDays: 7,
  /** Foto: dimensione massima delle immagini caricate (MB) */
  maxImageMB: 8,
  /** Strillone: lunghezza massima dell'annuncio (caratteri) */
  shoutMaxLength: 500,
  /** Stalla: ordinamento proposto all'apertura (ognuno può cambiarlo, e il browser lo ricorda) */
  stableDefaultSort: "recenti",
  /** Backup automatico attivo */
  backupAuto: true,
  /** Ogni quante ore viene creato un backup automatico */
  backupEveryHours: 24,
  /** Giorni di conservazione dei backup */
  backupDays: 14,
  /** Mappa: nome della categoria di ogni colore delle note (es. "#c8161d": "Pericolo") */
  mapNoteNames: {} as Record<string, string>,
  /** Mappa HD: livelli di zoom oltre la risoluzione vera dell'immagine (ingrandimento morbido, non a quadretti) */
  mapExtraZoom: 1,
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
