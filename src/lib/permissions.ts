/**
 * Permessi e ruoli.
 *
 * I PERMESSI sono definiti qui (cosa esiste nel programma). I RUOLI invece stanno nel database
 * (tabella AppRole) e si creano/modificano dal pannello Amministrazione → Ruoli, come su Discord:
 * ogni ruolo ha l'elenco dei permessi che gli sono stati dati e le razze che può vedere.
 *
 * "ADMIN" è il proprietario: ha sempre tutti i permessi, qualunque cosa ci sia nel database.
 * Il backend controlla i permessi prima di ogni lettura/scrittura (assertPermission / requireUser).
 */

export type PermissionDef = { label: string; group: string; hint?: string; defaults: string[] };

const ALL = ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"];
const BOSS = ["ADMIN", "DIRETTORE", "GESTORE"];
const TOP = ["ADMIN", "DIRETTORE"];

export const PERMISSIONS = {
  "dashboard.view": { group: "Generale", label: "Vedere l'Ufficio (pagina iniziale)", defaults: ALL },
  "dashboard.overview": { group: "Generale", label: "Vedere i numeri di tutta la stalla nell'Ufficio", defaults: BOSS },
  "dashboard.shout": { group: "Generale", label: "Usare lo Strillone (annuncio personale da copiare in gioco)", defaults: ALL },

  "catalog.view": { group: "Catalogo e prezzi", label: "Vedere il catalogo dei cavalli", defaults: ALL },
  "prices.view": { group: "Catalogo e prezzi", label: "Vedere listino e confronto prezzi", defaults: ALL },
  "catalog.manage": { group: "Catalogo e prezzi", label: "Modificare razze, manti, foto e prezzi", defaults: ["ADMIN"] },

  "horses.view": { group: "Stalla e vendite", label: "Vedere la stalla e le vendite", defaults: ALL },
  "horses.capture": { group: "Stalla e vendite", label: "Registrare catture", defaults: ALL },
  "horses.sell": { group: "Stalla e vendite", label: "Vendere i propri cavalli", defaults: ALL },
  "horses.train": { group: "Stalla e vendite", label: "Segnare un cavallo come addestrato (o togliere la spunta)", hint: "Il prezzo base mostrato include l'addestramento", defaults: ALL },
  "horses.manageAll": { group: "Stalla e vendite", label: "Vendere e gestire anche i cavalli degli altri", defaults: TOP },
  "horses.edit": { group: "Stalla e vendite", label: "Modificare note, condizione, targa, uscite", defaults: BOSS },
  "horses.correct": { group: "Stalla e vendite", label: "Correggere età, razza, manto e catturatore", defaults: ["ADMIN"] },
  "sales.overridePrice": { group: "Stalla e vendite", label: "Cambiare il prezzo di listino e superare lo sconto massimo", defaults: TOP },
  "horses.sellUnderage": { group: "Stalla e vendite", label: "Vendere cavalli che risultano troppo giovani", hint: "Per quando l'età calcolata è sbagliata (vale anche per rari e leggendari)", defaults: BOSS },
  "sales.viewAll": { group: "Stalla e vendite", label: "Vedere le vendite di tutti", defaults: BOSS },
  "sales.correct": { group: "Stalla e vendite", label: "Correggere e annullare vendite", defaults: ["ADMIN"] },

  "map.view": { group: "Mappa", label: "Vedere la mappa degli spawn", defaults: [...ALL, "OSPITE"] },
  "map.add": { group: "Mappa", label: "Aggiungere punti sulla mappa", defaults: ALL },
  "map.manage": { group: "Mappa", label: "Spostare, modificare ed eliminare i punti di tutti", defaults: BOSS },
  "map.exportImage": { group: "Mappa", label: "Esportare l'immagine della mappa con i punti", defaults: TOP },
  "map.backup": { group: "Mappa", label: "Scaricare il backup dei punti e reimportarlo", hint: "Con l'importazione “sostituisci” si possono rimpiazzare tutti i punti", defaults: TOP },

  "reservations.edit": { group: "Bacheca", label: "Vedere e scrivere note e prenotazioni", defaults: ALL },
  "reservations.delete": { group: "Bacheca", label: "Eliminare note e prenotazioni", defaults: BOSS },

  "shop.view": { group: "Bottega", label: "Vedere la bottega", defaults: ALL },
  "shop.sell": { group: "Bottega", label: "Vendere oggetti e fare proposte/rimborsi", defaults: ALL },
  "shop.manage": { group: "Bottega", label: "Gestire listino oggetti, fornitori, proposte e rimborsi", defaults: BOSS },

  "employees.list": { group: "Personale", label: "Vedere l'elenco del personale", defaults: BOSS },
  "employees.stats": { group: "Personale", label: "Vedere statistiche e storico di ogni stalliere", defaults: TOP },
  "payroll.manage": { group: "Personale", label: "Gestire e pagare gli stipendi", defaults: TOP },

  "audit.view": { group: "Amministrazione", label: "Aprire l'Amministrazione e il registro attività", defaults: TOP },
  "audit.ip": { group: "Amministrazione", label: "Vedere gli indirizzi IP e i browser nel registro attività", hint: "Dati personali: dallo solo a chi controlla la sicurezza", defaults: ["ADMIN"] },
  "users.manage": { group: "Amministrazione", label: "Creare e modificare utenti", defaults: ["ADMIN"] },
  "users.delete": { group: "Amministrazione", label: "Eliminare utenti e tutti i loro dati", defaults: ["ADMIN"] },
  "settings.manage": { group: "Amministrazione", label: "Impostazioni, mappa in alta definizione, azzeramento dati", defaults: ["ADMIN"] },
  "data.import": { group: "Amministrazione", label: "Importare il listino Excel", defaults: ["ADMIN"] },
  "data.export": { group: "Amministrazione", label: "Esportare dati in Excel/CSV", defaults: TOP },
  "data.backup": { group: "Amministrazione", label: "Backup e ripristino", defaults: ["ADMIN"] },
} as const satisfies Record<string, PermissionDef>;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];
export const isPermission = (p: string): p is Permission => p in PERMISSIONS;

export const ADMIN_ROLE = "ADMIN";

/** Razze visibili per un ruolo */
export type BreedAccess = { mode: "all" | "only" | "except"; breedIds: number[]; rare: boolean; legendary: boolean };
export const FULL_ACCESS: BreedAccess = { mode: "all", breedIds: [], rare: true, legendary: true };

export type RoleInfo = { key: string; name: string; color: string | null; sortOrder: number; system: boolean; permissions: Set<Permission>; access: BreedAccess };

/** Ruoli creati all'installazione (poi modificabili dal pannello). */
export const SYSTEM_ROLES: { key: string; name: string; color: string; access: BreedAccess }[] = [
  { key: "ADMIN", name: "Amministratore", color: "#c8161d", access: FULL_ACCESS },
  { key: "DIRETTORE", name: "Direttore", color: "#d6b25e", access: FULL_ACCESS },
  { key: "GESTORE", name: "Gestore", color: "#1d5f8f", access: FULL_ACCESS },
  { key: "DIPENDENTE", name: "Dipendente", color: "#1f7a3d", access: { mode: "all", breedIds: [], rare: false, legendary: false } },
  { key: "OSPITE", name: "Ospite", color: "#78716c", access: FULL_ACCESS },
];

export function defaultPermissionsFor(roleKey: string): Permission[] {
  return PERMISSION_KEYS.filter((p) => (PERMISSIONS[p].defaults as readonly string[]).includes(roleKey));
}

/* ───────── Cache dei ruoli (riempita dal server a ogni richiesta, vedi lib/roles.ts) ───────── */
const g = globalThis as unknown as { __roles?: Map<string, RoleInfo> };
export function setRoleCache(map: Map<string, RoleInfo>) {
  g.__roles = map;
}
export function getRole(key: string | null | undefined): RoleInfo | undefined {
  return key ? g.__roles?.get(key) : undefined;
}
export function allRoles(): RoleInfo[] {
  return [...(g.__roles?.values() ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function can(role: string | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  if (role === ADMIN_ROLE) return true;
  return getRole(role)?.permissions.has(perm) ?? false;
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return getRole(role)?.name ?? SYSTEM_ROLES.find((r) => r.key === role)?.name ?? role;
}

export function roleAccess(role: string | null | undefined): BreedAccess {
  if (!role || role === ADMIN_ROLE) return FULL_ACCESS;
  return getRole(role)?.access ?? FULL_ACCESS;
}

/** La razza (id) è visibile per questo ruolo? */
export function canSeeBreed(role: string | null | undefined, breedId: number | null | undefined): boolean {
  const a = roleAccess(role);
  if (a.mode === "all" || breedId == null) return true;
  return a.mode === "only" ? a.breedIds.includes(breedId) : !a.breedIds.includes(breedId);
}

/**
 * Gerarchia dei ruoli: il ruolo `target` non dà permessi che `actor` non ha.
 * Serve a impedire a chi gestisce gli utenti (ma non è amministratore) di prendere il controllo
 * di account più potenti del suo o di darsi/dare ruoli con più permessi.
 */
export function roleWithin(actorRole: string, targetRole: string): boolean {
  if (actorRole === ADMIN_ROLE) return true;
  if (targetRole === ADMIN_ROLE) return false;
  const a = getRole(actorRole)?.permissions;
  const t = getRole(targetRole)?.permissions;
  if (!a || !t) return false;
  for (const p of t) if (!a.has(p)) return false;
  return true;
}
