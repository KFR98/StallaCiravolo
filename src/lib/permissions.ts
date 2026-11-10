import type { Role } from "@prisma/client";

/**
 * Matrice permessi. È l'unica fonte di verità: viene usata sia per mostrare
 * i menu sia (soprattutto) dal backend prima di ogni lettura/scrittura.
 */
export const PERMISSIONS = {
  "dashboard.overview": ["ADMIN", "DIRETTORE", "GESTORE"],
  "catalog.view": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "catalog.manage": ["ADMIN"],
  "prices.view": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "horses.view": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "horses.capture": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "horses.sell": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  /** Modifica dati operativi (note, condizione, targa, uscita dalla stalla) */
  "horses.edit": ["ADMIN", "DIRETTORE", "GESTORE"],
  /** Correzione età, razza/manto, catturatore */
  "horses.correct": ["ADMIN"],
  /** Prezzo libero / sconti oltre il limite */
  "sales.overridePrice": ["ADMIN", "DIRETTORE"],
  "sales.viewAll": ["ADMIN", "DIRETTORE", "GESTORE"],
  "sales.correct": ["ADMIN"],
  "map.view": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "map.add": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "map.manage": ["ADMIN", "DIRETTORE", "GESTORE"],
  "reservations.edit": ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"],
  "reservations.delete": ["ADMIN", "DIRETTORE"],
  "employees.list": ["ADMIN", "DIRETTORE", "GESTORE"],
  "employees.stats": ["ADMIN", "DIRETTORE"],
  "payroll.manage": ["ADMIN", "DIRETTORE"],
  "audit.view": ["ADMIN", "DIRETTORE"],
  "users.manage": ["ADMIN"],
  "settings.manage": ["ADMIN"],
  "data.import": ["ADMIN"],
  "data.export": ["ADMIN", "DIRETTORE"],
  "data.backup": ["ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Amministratore",
  DIRETTORE: "Direttore",
  GESTORE: "Gestore",
  DIPENDENTE: "Dipendente",
};

export const ROLES: Role[] = ["ADMIN", "DIRETTORE", "GESTORE", "DIPENDENTE"];
