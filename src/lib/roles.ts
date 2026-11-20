import "server-only";
import { prisma } from "./db";
import { ADMIN_ROLE, FULL_ACCESS, PERMISSION_KEYS, isPermission, setRoleCache, type BreedAccess, type Permission, type RoleInfo } from "./permissions";
import { ensureSystemRoles } from "./roles-seed";
export { ensureSystemRoles };

let loadedAt = 0;
let loading: Promise<void> | null = null;
const TTL = 10_000;

export function parseAccess(raw: string | null | undefined): BreedAccess {
  try {
    const a = JSON.parse(raw || "{}");
    return {
      mode: a.mode === "only" || a.mode === "except" ? a.mode : "all",
      breedIds: Array.isArray(a.breedIds) ? a.breedIds.filter((n: unknown) => Number.isInteger(n)).slice(0, 500) : [],
      rare: a.rare !== false,
      legendary: a.legendary !== false,
    };
  } catch {
    return FULL_ACCESS;
  }
}

export function parsePermissions(raw: string | null | undefined): Permission[] {
  try {
    const a = JSON.parse(raw || "[]");
    return Array.isArray(a) ? a.filter((p): p is Permission => typeof p === "string" && isPermission(p)) : [];
  } catch {
    return [];
  }
}

async function load() {
  const rows = await prisma.appRole.findMany();
  if (!rows.length) {
    await ensureSystemRoles();
    return load();
  }
  const map = new Map<string, RoleInfo>();
  for (const r of rows) {
    map.set(r.key, {
      key: r.key, name: r.name, color: r.color, sortOrder: r.sortOrder, system: r.system,
      permissions: new Set(r.key === ADMIN_ROLE ? PERMISSION_KEYS : parsePermissions(r.permissions)),
      access: r.key === ADMIN_ROLE ? FULL_ACCESS : parseAccess(r.access),
    });
  }
  setRoleCache(map);
  loadedAt = Date.now();
}

/** Carica i ruoli dal database (con una piccola cache di 10 secondi). */
export async function loadRoles(force = false) {
  if (!force && Date.now() - loadedAt < TTL) return;
  loading ??= load().finally(() => { loading = null; });
  await loading;
}
