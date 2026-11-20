import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADMIN_ROLE, PERMISSIONS, PERMISSION_KEYS } from "@/lib/permissions";
import { parseAccess, parsePermissions, loadRoles } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { AdminTabs } from "../AdminTabs";
import { RolesEditor, type RoleData, type PermGroup } from "./RolesEditor";

export const metadata = { title: "Ruoli" };
export const dynamic = "force-dynamic";

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ ruolo?: string }> }) {
  const me = await requireUser("audit.view");
  if (me.role !== ADMIN_ROLE) redirect("/admin");
  await loadRoles(true);
  const [rows, counts, breeds] = await Promise.all([
    prisma.appRole.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.user.groupBy({ by: ["role"], _count: true, where: { active: true } }),
    prisma.breed.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const roles: RoleData[] = rows.map((r) => ({
    key: r.key, name: r.name, color: r.color ?? "#78716c", system: r.system,
    members: counts.find((c) => c.role === r.key)?._count ?? 0,
    permissions: r.key === ADMIN_ROLE ? PERMISSION_KEYS : parsePermissions(r.permissions),
    access: parseAccess(r.access),
  }));
  const groups: PermGroup[] = [];
  for (const k of PERMISSION_KEYS) {
    const d = PERMISSIONS[k] as { group: string; label: string; hint?: string };
    let g = groups.find((x) => x.name === d.group);
    if (!g) groups.push((g = { name: d.group, perms: [] }));
    g.perms.push({ key: k, label: d.label, hint: d.hint });
  }
  const { ruolo } = await searchParams;
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Ruoli e permessi: decidi chi può vedere e fare cosa, e quali razze vede ogni ruolo." />
      <AdminTabs role={me.role} active="ruoli" />
      <RolesEditor roles={roles} groups={groups} breeds={breeds} initial={ruolo} />
    </>
  );
}
