import { Tabs } from "@/components/ui";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";

export type MoneyTab = "vendite" | "cassa" | "chiusure" | "stipendi" | "storico";

/** Schede della sezione Soldi: vendite, cassa, chiusure, stipendi. Ognuno vede solo quelle dei suoi permessi. */
export async function MoneyTabs({ role, active }: { role: string; active: MoneyTab }) {
  const items: { key: MoneyTab; href: string; label: string; alert?: number }[] = [];
  if (can(role, "horses.view")) items.push({ key: "vendite", href: "/vendite", label: "Vendite" });
  if (can(role, "cash.view")) items.push({ key: "cassa", href: "/cassa", label: "Cassa" }, { key: "chiusure", href: "/cassa/chiusure", label: "Chiusure di cassa" });
  if (can(role, "payroll.manage")) {
    // numerino rosso sulla scheda: dipendenti con stipendi arretrati (se la notifica è accesa)
    const me = await getCurrentUser();
    const alert = me ? (await getNotifications(me, { only: "soldi" })).badges.soldi?.n : undefined;
    items.push({ key: "stipendi", href: "/stipendi", label: "Stipendi", alert }, { key: "storico", href: "/stipendi?vista=storico", label: "Storico pagamenti" });
  }
  return items.length > 1 ? <Tabs active={active} items={items} /> : null;
}

/** Prima pagina della sezione Soldi che il ruolo può aprire. */
export function moneyHome(role: string) {
  return can(role, "horses.view") ? "/vendite" : can(role, "cash.view") ? "/cassa" : "/stipendi";
}
