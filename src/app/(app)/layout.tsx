import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { AppShell, type NavItem } from "@/components/Sidebar";
import { logoutAction } from "../login/actions";

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/", label: "Ufficio", icon: "dashboard", perm: "catalog.view", match: ["/"], mobile: true },
  { href: "/stalla", label: "Stalla", icon: "stable", perm: "horses.view", match: ["/stalla"], mobile: true },
  { href: "/vendite", label: "Vendite", icon: "sales", perm: "horses.view", match: ["/vendite"], mobile: true },
  { href: "/bottega", label: "Bottega", icon: "shop", perm: "shop.view", match: ["/bottega"] },
  { href: "/mappa", label: "Mappa spawn", icon: "map", perm: "map.view", match: ["/mappa"], mobile: true },
  { href: "/catalogo", label: "Catalogo e prezzi", icon: "catalog", perm: "catalog.view", match: ["/catalogo", "/confronto", "/listino"] },
  { href: "/prenotazioni", label: "Bacheca", icon: "notes", perm: "reservations.edit", match: ["/prenotazioni"] },
  { href: "/dipendenti", label: "Personale", icon: "staff", perm: "employees.list", match: ["/dipendenti", "/stipendi"] },
  { href: "/admin", label: "Amministrazione", icon: "admin", perm: "audit.view", match: ["/admin"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const stableName = await getSetting("stableName");
  const items = NAV.filter((n) => can(user.role, n.perm)).map(({ perm: _p, ...rest }) => rest);
  return (
    <AppShell
      items={items}
      user={{ displayName: user.displayName, roleLabel: ROLE_LABELS[user.role] }}
      stableName={stableName}
      canCapture={can(user.role, "horses.capture")}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
