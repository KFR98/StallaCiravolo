import { prisma } from "./db";

/** Impostazioni globali con valori predefiniti. Tutte modificabili dall'admin. */
export const DEFAULT_SETTINGS = {
  stableName: "Stalla Ciravolo",
  /** Link d'invito al server Discord (logo nel menu e nella pagina di accesso). Vuoto = logo nascosto */
  discordUrl: "https://discord.com/invite/fkf4nVN2Fm",
  /** Colore della pennellata del pulsante Discord: "avorio", "rossa" o "nera" */
  discordStyle: "avorio" as "avorio" | "rossa" | "nera",
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
  /** Sicurezza: registra l'IP anche per tutte le operazioni (gli accessi lo registrano sempre) */
  auditIpAll: true,
  /** Registro attività: livello scelto dall'admin per le singole azioni (es. "VENDITA": "warn"); le altre usano la proposta */
  auditLevelOverrides: {} as Record<string, string>,
  /** Registro attività: nome e colore di ogni livello di pericolosità */
  auditLevelStyle: {
    info: { name: "Info", color: "#64748b" },
    warn: { name: "Warn", color: "#d97706" },
    alarm: { name: "Alarm", color: "#dc2626" },
    critical: { name: "Critico", color: "#a21caf" },
  } as Record<"info" | "warn" | "alarm" | "critical", { name: string; color: string }>,
  /** Registro attività: dopo quanti accessi falliti dallo stesso IP… */
  auditFailBurst: 5,
  /** …in quanti minuti la voce diventa "Tentativi di accesso ripetuti" */
  auditFailBurstMinutes: 15,
  /** Registro attività: segnala l'accesso di un utente da un IP che non aveva mai usato */
  auditNewIpLogin: true,
  /** reCAPTCHA di Google sulla pagina di accesso (la chiave segreta è salvata a parte, mai mandata al browser) */
  recaptchaEnabled: false,
  /** "v2" = casella "Non sono un robot"; "v3" = invisibile, con punteggio */
  recaptchaVersion: "v2" as "v2" | "v3",
  /** Chiave pubblica (del sito) */
  recaptchaSiteKey: "",
  /** Solo v3: punteggio minimo per entrare (0 = robot sicuro, 1 = persona sicura) */
  recaptchaMinScore: 0.5,
  /** Sicurezza: durata della sessione (giorni), si rinnova da sola se usata */
  sessionDays: 7,
  /** Foto: dimensione massima delle immagini caricate (MB) */
  maxImageMB: 8,
  /** Stipendi: gli addestramenti venduti in bottega contano come "stable" (percentuale vendite in stalla) o "items" (percentuale oggetti) */
  trainingPayrollCategory: "stable" as "stable" | "items",
  /** Vendite: colore dell'etichetta di ogni tipo (Cavallo, Addestramento, Vetrina = oggetti, Blip = governo) */
  saleLabelColors: { cavallo: "#1d5f8f", addestramento: "#1f7a3d", vetrina: "#b7791f", blip: "#78716c" } as Record<"cavallo" | "addestramento" | "vetrina" | "blip", string>,
  /** Cassa: le vendite al blip del Governo entrano in cassa */
  cashCountGov: true,
  /** Cassa: gli stipendi pagati escono dalla cassa */
  cashCountPayroll: true,
  /** Cassa: i rimborsi pagati escono dalla cassa */
  cashCountReimbursements: true,
  /** Menu: numerini delle cose da fare accanto alle voci (ognuno vede solo quelli delle sue sezioni) */
  navBadges: { stalla: true, bottega: true, bacheca: true, personale: true, admin: true } as Record<"stalla" | "bottega" | "bacheca" | "personale" | "admin", boolean>,
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
