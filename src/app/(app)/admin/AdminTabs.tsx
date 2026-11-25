type Role = string;
import { Tabs } from "@/components/ui";
import { can, type Permission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";

/**
 * Schede dell'Amministrazione (7). "Importa Excel" sta dentro "Backup e dati", la mappa HD dentro "Impostazioni":
 * le loro pagine esistono ancora e accendono la scheda che le contiene.
 */
const ITEMS: { key: string; href: string | ((role: Role) => string); label: string; perms: Permission[]; ownerOnly?: boolean }[] = [
  { key: "home", href: "/admin", label: "Panoramica", perms: ["audit.view"] },
  { key: "utenti", href: "/admin/utenti", label: "Utenti", perms: ["users.manage"] },
  { key: "ruoli", href: "/admin/ruoli", label: "Ruoli", perms: ["audit.view"], ownerOnly: true },
  { key: "catalogo", href: "/admin/catalogo", label: "Catalogo", perms: ["catalog.manage"] },
  { key: "impostazioni", href: "/admin/impostazioni", label: "Impostazioni", perms: ["settings.manage"] },
  { key: "backup", href: (r) => (can(r, "data.backup") ? "/admin/backup" : "/admin/import"), label: "Backup e dati", perms: ["data.backup", "data.import"] },
  { key: "audit", href: "/admin/audit", label: "Registro attività", perms: ["audit.view"] },
];

export async function AdminTabs({ role, active }: { role: Role; active: string }) {
  const key = active === "import" ? "backup" : active === "mappa" ? "impostazioni" : active;
  // numerino rosso sul Registro: voci Alarm/Critico recenti (se la notifica è accesa)
  const me = await getCurrentUser();
  const alert = me ? (await getNotifications(me, { only: "admin" })).badges.admin?.n : undefined;
  return (
    <Tabs
      active={key}
      items={ITEMS.filter((i) => i.perms.some((p) => can(role, p)) && (!i.ownerOnly || role === "ADMIN")).map((i) => ({
        key: i.key, label: i.label, href: typeof i.href === "function" ? i.href(role) : i.href, alert: i.key === "audit" ? alert : undefined,
      }))}
    />
  );
}
