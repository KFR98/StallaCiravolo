import { Tabs } from "@/components/ui";
import type { Role } from "@prisma/client";
import { can } from "@/lib/permissions";

export function StaffTabs({ role, active }: { role: Role; active: "dipendenti" | "stipendi" | "storico" }) {
  const items = [{ key: "dipendenti", href: "/dipendenti", label: "Dipendenti" }];
  if (can(role, "payroll.manage")) {
    items.push({ key: "stipendi", href: "/stipendi", label: "Stipendi" }, { key: "storico", href: "/stipendi?vista=storico", label: "Storico pagamenti" });
  }
  return items.length > 1 ? <Tabs items={items} active={active} /> : null;
}
