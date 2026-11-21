import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const me = await requireUser("settings.manage");
  const [s, inStable, shopItems] = await Promise.all([
    getSettings(),
    prisma.horse.count({ where: { status: "IN_STALLA" } }),
    prisma.shopItem.findMany({ where: { kind: "VENDITA", archived: false }, orderBy: [{ group: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Amministrazione" subtitle="Parametri di funzionamento della stalla. Ogni modifica viene registrata." />
      <AdminTabs role={me.role} active="impostazioni" />
      <Card>
        <SettingsForm s={s} inStable={inStable} shopItems={shopItems} />
      </Card>
    </>
  );
}
