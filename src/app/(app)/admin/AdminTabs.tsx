import type { Role } from "@prisma/client";
import { Tabs } from "@/components/ui";
import { can, type Permission } from "@/lib/permissions";

const ITEMS: { key: string; href: string; label: string; perm: Permission }[] = [
  { key: "home", href: "/admin", label: "Panoramica", perm: "audit.view" },
  { key: "utenti", href: "/admin/utenti", label: "Utenti", perm: "users.manage" },
  { key: "catalogo", href: "/admin/catalogo", label: "Catalogo", perm: "catalog.manage" },
  { key: "impostazioni", href: "/admin/impostazioni", label: "Impostazioni", perm: "settings.manage" },
  { key: "backup", href: "/admin/backup", label: "Backup e dati", perm: "data.backup" },
  { key: "import", href: "/admin/import", label: "Importa Excel", perm: "data.import" },
  { key: "audit", href: "/admin/audit", label: "Registro attività", perm: "audit.view" },
];

export function AdminTabs({ role, active }: { role: Role; active: string }) {
  return <Tabs active={active} items={ITEMS.filter((i) => can(role, i.perm))} />;
}
