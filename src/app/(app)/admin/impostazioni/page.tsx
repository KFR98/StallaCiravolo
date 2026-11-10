import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { PageHeader, Panel } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  await requireUser("settings.manage");
  const [s, inStable] = await Promise.all([getSettings(), prisma.horse.count({ where: { status: "IN_STALLA" } })]);
  return (
    <>
      <PageHeader title="Impostazioni globali" subtitle="Parametri di funzionamento della stalla. Ogni modifica viene registrata." />
      <Panel>
        <SettingsForm s={s} inStable={inStable} />
      </Panel>
    </>
  );
}
