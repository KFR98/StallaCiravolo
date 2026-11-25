import { Tabs } from "@/components/ui";
import { can } from "@/lib/permissions";

export type MoneyTab = "vendite" | "cassa" | "chiusure" | "stipendi" | "storico";

/** Schede della sezione Soldi: vendite, cassa, chiusure, stipendi. Ognuno vede solo quelle dei suoi permessi. */
export function MoneyTabs({ role, active }: { role: string; active: MoneyTab }) {
  const items: { key: MoneyTab; href: string; label: string }[] = [];
  if (can(role, "horses.view")) items.push({ key: "vendite", href: "/vendite", label: "Vendite" });
  if (can(role, "cash.view")) items.push({ key: "cassa", href: "/cassa", label: "Cassa" }, { key: "chiusure", href: "/cassa/chiusure", label: "Chiusure di cassa" });
  if (can(role, "payroll.manage")) items.push({ key: "stipendi", href: "/stipendi", label: "Stipendi" }, { key: "storico", href: "/stipendi?vista=storico", label: "Storico pagamenti" });
  return items.length > 1 ? <Tabs active={active} items={items} /> : null;
}

/** Prima pagina della sezione Soldi che il ruolo può aprire. */
export function moneyHome(role: string) {
  return can(role, "horses.view") ? "/vendite" : can(role, "cash.view") ? "/cassa" : "/stipendi";
}
