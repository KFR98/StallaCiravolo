/**
 * Livelli di pericolosità del registro attività.
 * Qui c'è solo la PROPOSTA di partenza: livello, nome e colore si cambiano da
 * Amministrazione → Registro attività → "Livelli di pericolosità" (salvati nelle impostazioni).
 */

export const LEVELS = ["info", "warn", "alarm", "critical"] as const;
export type Level = (typeof LEVELS)[number];
export const isLevel = (v: unknown): v is Level => typeof v === "string" && (LEVELS as readonly string[]).includes(v);

/** Cosa significa ogni livello (testo d'aiuto, non modificabile). */
export const LEVEL_HELP: Record<Level, string> = {
  info: "Lavoro di tutti i giorni",
  warn: "Da tenere d'occhio",
  alarm: "Operazione delicata: controlla che sia giusta",
  critical: "Può cambiare permessi o cancellare dati: verifica sempre",
};

type ActionDef = { label: string; level: Level; group: string };

/** Nome leggibile e livello proposto per ogni azione registrata. */
export const AUDIT_ACTIONS: Record<string, ActionDef> = {
  // Accessi
  LOGIN: { label: "Accesso", level: "info", group: "Accessi" },
  LOGOUT: { label: "Uscita", level: "info", group: "Accessi" },
  LOGIN_NUOVO_IP: { label: "Accesso da un IP mai visto", level: "warn", group: "Accessi" },
  LOGIN_FALLITO: { label: "Accesso fallito", level: "warn", group: "Accessi" },
  LOGIN_FALLITO_RIPETUTO: { label: "Tentativi di accesso ripetuti", level: "alarm", group: "Accessi" },
  MODIFICA_PROFILO: { label: "Profilo modificato", level: "info", group: "Accessi" },
  // Stalla e vendite
  CATTURA: { label: "Cattura", level: "info", group: "Stalla e vendite" },
  VENDITA: { label: "Vendita", level: "info", group: "Stalla e vendite" },
  VENDITA_GOVERNO: { label: "Vendita al blip", level: "info", group: "Stalla e vendite" },
  ADDESTRAMENTO: { label: "Addestramento", level: "info", group: "Stalla e vendite" },
  GRAVIDANZA: { label: "Gravidanza", level: "info", group: "Stalla e vendite" },
  PARTO: { label: "Parto", level: "info", group: "Stalla e vendite" },
  DATI_PULEDRO: { label: "Dati del puledro", level: "info", group: "Stalla e vendite" },
  MODIFICA_CAVALLO: { label: "Cavallo modificato", level: "info", group: "Stalla e vendite" },
  USCITA_CAVALLO: { label: "Uscita di un cavallo", level: "warn", group: "Stalla e vendite" },
  TRASFERIMENTO: { label: "Cavallo trasferito", level: "warn", group: "Stalla e vendite" },
  RIPRISTINO_CAVALLO: { label: "Cavallo rimesso in stalla", level: "warn", group: "Stalla e vendite" },
  CORREZIONE_CAVALLO: { label: "Dati del cavallo corretti", level: "alarm", group: "Stalla e vendite" },
  CORREZIONE_VENDITA: { label: "Vendita corretta", level: "alarm", group: "Stalla e vendite" },
  ANNULLA_VENDITA: { label: "Vendita annullata", level: "alarm", group: "Stalla e vendite" },
  // Bottega
  VENDITA_OGGETTI: { label: "Vendita in bottega", level: "info", group: "Bottega" },
  PROPOSTA_BOTTEGA: { label: "Proposta in bottega", level: "info", group: "Bottega" },
  RICHIESTA_RIMBORSO: { label: "Richiesta di rimborso", level: "info", group: "Bottega" },
  GESTIONE_PROPOSTA: { label: "Proposta gestita", level: "info", group: "Bottega" },
  GESTIONE_RIMBORSO: { label: "Rimborso gestito", level: "warn", group: "Bottega" },
  DEPOSITO: { label: "Deposito", level: "info", group: "Bottega" },
  NUOVO_ARTICOLO: { label: "Nuovo articolo", level: "info", group: "Bottega" },
  MODIFICA_ARTICOLO: { label: "Articolo modificato", level: "info", group: "Bottega" },
  NUOVO_FORNITORE: { label: "Nuovo fornitore", level: "info", group: "Bottega" },
  MODIFICA_FORNITORE: { label: "Fornitore modificato", level: "info", group: "Bottega" },
  ELIMINA_ARTICOLO: { label: "Articolo eliminato", level: "warn", group: "Bottega" },
  ELIMINA_FORNITORE: { label: "Fornitore eliminato", level: "warn", group: "Bottega" },
  ELIMINA_PROPOSTA: { label: "Proposta eliminata", level: "warn", group: "Bottega" },
  ANNULLA_VENDITA_OGGETTI: { label: "Vendita in bottega annullata", level: "alarm", group: "Bottega" },
  // Mappa e bacheca
  NUOVO_SPAWN: { label: "Nuovo punto sulla mappa", level: "info", group: "Mappa e bacheca" },
  MODIFICA_SPAWN: { label: "Punto della mappa modificato", level: "info", group: "Mappa e bacheca" },
  SPOSTA_SPAWN: { label: "Punto della mappa spostato", level: "info", group: "Mappa e bacheca" },
  ELIMINA_SPAWN: { label: "Punto della mappa eliminato", level: "warn", group: "Mappa e bacheca" },
  CATEGORIE_NOTE: { label: "Categorie delle note", level: "info", group: "Mappa e bacheca" },
  ESPORTA_MAPPA: { label: "Backup della mappa scaricato", level: "info", group: "Mappa e bacheca" },
  IMPORTA_MAPPA: { label: "Backup della mappa importato", level: "alarm", group: "Mappa e bacheca" },
  NUOVA_PRENOTAZIONE: { label: "Nuova nota in bacheca", level: "info", group: "Mappa e bacheca" },
  MODIFICA_PRENOTAZIONE: { label: "Nota in bacheca modificata", level: "info", group: "Mappa e bacheca" },
  STATO_PRENOTAZIONE: { label: "Stato di una nota", level: "info", group: "Mappa e bacheca" },
  ELIMINA_PRENOTAZIONE: { label: "Nota in bacheca eliminata", level: "warn", group: "Mappa e bacheca" },
  // Catalogo
  CREA_RAZZA: { label: "Nuova razza", level: "info", group: "Catalogo" },
  MODIFICA_RAZZA: { label: "Razza modificata", level: "info", group: "Catalogo" },
  CREA_MANTO: { label: "Nuovo manto", level: "info", group: "Catalogo" },
  MODIFICA_MANTO: { label: "Manto modificato", level: "info", group: "Catalogo" },
  IMMAGINE_MANTO: { label: "Foto del manto", level: "info", group: "Catalogo" },
  IMMAGINI_DA_LINK: { label: "Foto scaricate da link", level: "info", group: "Catalogo" },
  MODIFICA_STATISTICHE: { label: "Statistiche modificate", level: "info", group: "Catalogo" },
  ELIMINA_RAZZA: { label: "Razza eliminata", level: "alarm", group: "Catalogo" },
  ELIMINA_MANTO: { label: "Manto eliminato", level: "warn", group: "Catalogo" },
  ELIMINA_STATISTICA: { label: "Statistica eliminata", level: "warn", group: "Catalogo" },
  IMPORT_LISTINO: { label: "Listino Excel importato", level: "warn", group: "Catalogo" },
  // Personale
  STIPENDIO_PAGATO: { label: "Stipendio pagato", level: "info", group: "Personale" },
  STIPENDIO_NON_PAGATO: { label: "Pagamento stipendio annullato", level: "warn", group: "Personale" },
  STIPENDIO_MODIFICATO: { label: "Stipendio modificato", level: "alarm", group: "Personale" },
  PERCENTUALI_STIPENDIO: { label: "Percentuali degli stipendi", level: "alarm", group: "Personale" },
  // Amministrazione
  MAPPA_CARICATA: { label: "Mappa HD caricata", level: "info", group: "Amministrazione" },
  MAPPA_GENERATA: { label: "Mappa HD generata", level: "info", group: "Amministrazione" },
  MAPPA_ZOOM: { label: "Zoom della mappa", level: "info", group: "Amministrazione" },
  MAPPA_SEMPLICE: { label: "Mappa semplice", level: "info", group: "Amministrazione" },
  BACKUP: { label: "Backup creato", level: "info", group: "Amministrazione" },
  ESPORTAZIONE: { label: "Dati esportati", level: "warn", group: "Amministrazione" },
  CREA_UTENTE: { label: "Nuovo utente", level: "warn", group: "Amministrazione" },
  MODIFICA_UTENTE: { label: "Utente modificato", level: "alarm", group: "Amministrazione" },
  RESET_PASSWORD: { label: "Password reimpostata", level: "alarm", group: "Amministrazione" },
  IMPOSTAZIONI: { label: "Impostazioni cambiate", level: "alarm", group: "Amministrazione" },
  DOWNLOAD_BACKUP: { label: "Backup scaricato", level: "alarm", group: "Amministrazione" },
  CREA_RUOLO: { label: "Nuovo ruolo", level: "critical", group: "Amministrazione" },
  MODIFICA_RUOLO: { label: "Ruolo modificato", level: "critical", group: "Amministrazione" },
  ELIMINA_RUOLO: { label: "Ruolo eliminato", level: "critical", group: "Amministrazione" },
  ELIMINA_UTENTE: { label: "Utente eliminato con i suoi dati", level: "critical", group: "Amministrazione" },
  RIPRISTINO: { label: "Database ripristinato da backup", level: "critical", group: "Amministrazione" },
  AZZERAMENTO: { label: "Dati azzerati", level: "critical", group: "Amministrazione" },
};

export function actionLabel(action: string): string {
  return AUDIT_ACTIONS[action]?.label ?? action.charAt(0) + action.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Livello di un'azione: prima la scelta dell'admin, poi la proposta, poi "info". */
export function levelOf(action: string, overrides: Record<string, string>): Level {
  const o = overrides[action];
  if (isLevel(o)) return o;
  return AUDIT_ACTIONS[action]?.level ?? "info";
}

/** Azioni che (con le scelte attuali) hanno questo livello. */
export function actionsAt(level: Level, overrides: Record<string, string>, known: string[]): string[] {
  const all = new Set([...Object.keys(AUDIT_ACTIONS), ...known]);
  return [...all].filter((a) => levelOf(a, overrides) === level);
}
