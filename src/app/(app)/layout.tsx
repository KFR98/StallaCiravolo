import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { Sidebar, type NavItem } from "@/components/Sidebar";
import { logoutAction } from "../login/actions";

const NAV: (NavItem & { perm: Permission })[] = [
  { href: "/", label: "Ufficio", icon: "dashboard", perm: "catalog.view" },
  { href: "/stalla/nuovo", label: "Registra cattura", icon: "add", perm: "horses.capture", section: "Stalla" },
  { href: "/stalla", label: "Cavalli in stalla", icon: "stable", perm: "horses.view", section: "Stalla" },
  { href: "/vendite", label: "Registro vendite", icon: "sales", perm: "horses.view", section: "Stalla" },
  { href: "/prenotazioni", label: "Note e prenotazioni", icon: "notes", perm: "reservations.edit", section: "Stalla" },
  { href: "/mappa", label: "Mappa degli spawn", icon: "map", perm: "map.view", section: "Stalla" },
  { href: "/catalogo", label: "Catalogo cavalli", icon: "catalog", perm: "catalog.view", section: "Catalogo" },
  { href: "/listino", label: "Listino prezzi", icon: "price", perm: "prices.view", section: "Catalogo" },
  { href: "/confronto", label: "Confronto prezzi", icon: "compare", perm: "prices.view", section: "Catalogo" },
  { href: "/dipendenti", label: "Dipendenti", icon: "users", perm: "employees.list", section: "Direzione" },
  { href: "/stipendi", label: "Stipendi", icon: "coins", perm: "payroll.manage", section: "Direzione" },
  { href: "/admin", label: "Amministrazione", icon: "admin", perm: "audit.view", section: "Direzione" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const stableName = await getSetting("stableName");
  const items = NAV.filter((n) => can(user.role, n.perm)).map(({ perm: _p, ...rest }) => rest);
  return (
    <div className="min-h-dvh">
      <Sidebar items={items} user={{ displayName: user.displayName, roleLabel: ROLE_LABELS[user.role] }} stableName={stableName} logout={logoutAction} />
      <main className="lg:pl-[260px]">
        <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-7">{children}</div>
      </main>
    </div>
  );
}
