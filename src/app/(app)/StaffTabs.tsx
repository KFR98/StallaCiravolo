import { Tabs } from "@/components/ui";
type Role = string;
import { can } from "@/lib/permissions";

export function StaffTabs({ role, active }: { role: Role; active: "dipendenti" | "stipendi" | "storico" }) {
  const items = [{ key: "dipendenti", href: "/dipendenti", label: "Dipendenti" }];
  // gli stipendi stanno nella sezione Soldi: qui solo un collegamento
  if (can(role, "payroll.manage")) items.push({ key: "stipendi", href: "/stipendi", label: "Stipendi →" });
  return items.length > 1 ? <Tabs items={items} active={active} /> : null;
}
