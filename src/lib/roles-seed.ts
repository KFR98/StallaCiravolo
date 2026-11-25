/** Usato dallo script di avvio (fuori da Next): crea i ruoli di base se mancano. */
import { prisma } from "./db";
import { ADMIN_ROLE, PERMISSION_KEYS, PERMISSIONS, SYSTEM_ROLES, defaultPermissionsFor } from "./permissions";

const KNOWN_KEY = "permessi_conosciuti";
/** Permessi aggiunti dopo l'introduzione di questo meccanismo (vanno assegnati ai ruoli di base esistenti). */
const ADDED_LATER = ["map.exportImage", "map.backup", "horses.sellUnderage", "horses.train", "dashboard.shout", "shop.flatPrice", "cash.view", "cash.manage", "customers.view", "customers.manage", "cash.close", "notifications.view"];

export async function ensureSystemRoles() {
  for (const [i, r] of SYSTEM_ROLES.entries()) {
    if (await prisma.appRole.findUnique({ where: { key: r.key } })) continue;
    await prisma.appRole.create({
      data: {
        key: r.key, name: r.name, color: r.color, sortOrder: i * 10, system: true,
        permissions: JSON.stringify(r.key === ADMIN_ROLE ? PERMISSION_KEYS : defaultPermissionsFor(r.key)),
        access: JSON.stringify(r.access),
      },
    });
  }
  await grantNewPermissions();
}

/**
 * Quando una nuova versione aggiunge un permesso, i ruoli già salvati non lo hanno.
 * Una sola volta per permesso, lo si assegna ai ruoli di base indicati nei suoi "defaults";
 * da lì in poi decide l'amministratore dal pannello Ruoli (togliendolo non torna più).
 */
async function grantNewPermissions() {
  const row = await prisma.setting.findUnique({ where: { key: KNOWN_KEY } });
  let known: string[] | null = null;
  try {
    known = row ? JSON.parse(row.value) : null;
  } catch {
    known = null;
  }
  if (!known) {
    // prima volta che questo controllo gira: si parte dai permessi che esistevano prima di
    // introdurlo; quelli aggiunti dopo (qui sotto) vengono assegnati ai ruoli di base
    await prisma.setting.upsert({ where: { key: KNOWN_KEY }, create: { key: KNOWN_KEY, value: JSON.stringify(PERMISSION_KEYS) }, update: {} });
    known = PERMISSION_KEYS.filter((k) => !ADDED_LATER.includes(k));
    if (row) return;
  }
  const fresh = PERMISSION_KEYS.filter((k) => !known!.includes(k));
  if (!fresh.length) return;
  const roles = await prisma.appRole.findMany();
  for (const role of roles) {
    if (role.key === ADMIN_ROLE) continue;
    const add = fresh.filter((k) => (PERMISSIONS[k].defaults as readonly string[]).includes(role.key));
    if (!add.length) continue;
    let perms: string[] = [];
    try {
      perms = JSON.parse(role.permissions);
    } catch {
      perms = [];
    }
    await prisma.appRole.update({ where: { key: role.key }, data: { permissions: JSON.stringify([...new Set([...perms, ...add])]) } });
    console.log(`Ruoli: a "${role.name}" aggiunti i nuovi permessi ${add.join(", ")}.`);
  }
  await prisma.setting.upsert({ where: { key: KNOWN_KEY }, create: { key: KNOWN_KEY, value: JSON.stringify(PERMISSION_KEYS) }, update: { value: JSON.stringify(PERMISSION_KEYS) } });
}
