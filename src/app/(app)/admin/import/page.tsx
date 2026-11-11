import { requireUser } from "@/lib/auth";
import { AdminTabs } from "../AdminTabs";
import { PageHeader, Card } from "@/components/ui";
import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Importa listino" };

export default async function ImportPage() {
  const me = await requireUser("data.import");
  return (
    <>
      <PageHeader title="Amministrazione" subtitle='Carica il file (foglio "LISTINO"). Prima vedrai il riepilogo dei dati e delle anomalie; nulla viene salvato fino alla conferma.' />
      <AdminTabs role={me.role} active="import" />
      <Card><ImportWizard /></Card>
    </>
  );
}
