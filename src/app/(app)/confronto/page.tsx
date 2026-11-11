import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getCatalogRows } from "@/lib/catalog";
import { PageHeader } from "@/components/ui";
import { CatalogTabs } from "../CatalogTabs";
import { CompareTable } from "./CompareTable";

export const metadata = { title: "Confronto cavalli" };

export default async function ComparePage() {
  await requireUser("prices.view");
  const [{ meta, rows }, s] = await Promise.all([getCatalogRows(), getSettings()]);
  return (
    <>
      <PageHeader title="Catalogo e prezzi" subtitle="Confronta i cavalli per voto, statistiche e prezzo, per consigliare l'acquirente." />
      <CatalogTabs active="confronto" />
      <CompareTable rows={rows} meta={meta} labels={{ a: `${s.minSaleAge}-${s.bracketAMax} anni`, b: `${s.bracketAMax + 1}-${s.bracketBMax} anni` }} />
    </>
  );
}
