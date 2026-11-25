import { Tabs } from "@/components/ui";
import { can } from "@/lib/permissions";

/** Schede della sezione Clienti: bacheca delle prenotazioni e rubrica. */
export function ClientTabs({ role, active }: { role: string; active: "bacheca" | "clienti" }) {
  const items = [];
  if (can(role, "reservations.edit")) items.push({ key: "bacheca", href: "/prenotazioni", label: "Bacheca prenotazioni" });
  if (can(role, "customers.view")) items.push({ key: "clienti", href: "/clienti", label: "Rubrica clienti" });
  return items.length > 1 ? <Tabs active={active} items={items} /> : null;
}
