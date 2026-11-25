import { requireUser } from "@/lib/auth";
import { can, roleLabel, type Permission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { discordLink } from "@/lib/discord";
import { navBadges } from "@/lib/nav-badges";
import { moneyHome } from "./MoneyTabs";
import { AppShell, type NavItem } from "@/components/Sidebar";
import { logoutAction } from "../login/actions";

/** Voci del menu. "perms": basta uno dei permessi. La chiave serve per la barra in basso del telefono (Impostazioni). */
const NAV: (Omit<NavItem, "href"> & { href: string | ((role: string) => string); perms: Permission[] })[] = [
  { key: "ufficio", href: "/", label: "Ufficio", icon: "dashboard", perms: ["dashboard.view"], match: ["/"] },
  { key: "stalla", href: "/stalla", label: "Stalla", icon: "stable", perms: ["horses.view"], match: ["/stalla"] },
  { key: "bottega", href: "/bottega", label: "Bottega", icon: "shop", perms: ["shop.view"], match: ["/bottega"] },
  { key: "soldi", href: moneyHome, label: "Soldi", icon: "sales", perms: ["horses.view", "cash.view", "payroll.manage"], match: ["/vendite", "/cassa", "/stipendi"] },
  { key: "mappa", href: "/mappa", label: "Mappa spawn", icon: "map", perms: ["map.view"], match: ["/mappa"] },
  { key: "catalogo", href: "/catalogo", label: "Catalogo e prezzi", icon: "catalog", perms: ["catalog.view"], match: ["/catalogo", "/confronto", "/listino"] },
  { key: "bacheca", href: "/prenotazioni", label: "Bacheca e clienti", icon: "notes", perms: ["reservations.edit"], match: ["/prenotazioni", "/clienti"] },
  { key: "personale", href: "/dipendenti", label: "Personale", icon: "staff", perms: ["employees.list"], match: ["/dipendenti"] },
  { key: "admin", href: "/admin", label: "Amministrazione", icon: "admin", perms: ["audit.view"], match: ["/admin"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { stableName, discordUrl, discordStyle, mobileNav } = await getSettings();
  const badges = await navBadges(user);
  const visible = NAV.filter((n) => n.perms.some((p) => can(user.role, p)));
  // barra in basso del telefono: le 4 voci scelte in Impostazioni (tra quelle che il ruolo vede), poi le altre in ordine
  const mobile = [...mobileNav.filter((k) => visible.some((n) => n.key === k)), ...visible.map((n) => n.key).filter((k) => !mobileNav.includes(k))].slice(0, 4);
  const items: NavItem[] = visible.map(({ perms: _p, href, ...rest }) => ({
    ...rest, href: typeof href === "function" ? href(user.role) : href, mobile: mobile.includes(rest.key), badge: badges[rest.key],
  }));
  return (
    <AppShell
      items={items}
      mobileOrder={mobile}
      user={{ displayName: user.displayName, roleLabel: roleLabel(user.role) }}
      stableName={stableName}
      canCapture={can(user.role, "horses.capture")}
      discordUrl={discordLink(discordUrl)}
      discordStyle={discordStyle}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
