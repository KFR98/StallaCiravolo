import { requireUser } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/ui";
import { ImportWizard } from "./ImportWizard";

export const metadata = { title: "Importa listino" };

export default async function ImportPage() {
  await requireUser("data.import");
  return (
    <>
      <PageHeader title="Importa listino Excel" subtitle='Carica il file (foglio "LISTINO"). Prima vedrai il riepilogo dei dati e delle anomalie; nulla viene salvato fino alla conferma.' />
      <Panel><ImportWizard /></Panel>
    </>
  );
}
