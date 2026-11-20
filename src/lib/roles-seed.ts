/** Usato dallo script di avvio (fuori da Next): crea i ruoli di base se mancano. */
import { prisma } from "./db";
import { ADMIN_ROLE, PERMISSION_KEYS, SYSTEM_ROLES, defaultPermissionsFor } from "./permissions";

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
}
