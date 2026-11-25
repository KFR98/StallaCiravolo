import { canSeeBreed } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getCatalogRows } from "@/lib/catalog";
import { PageHeader } from "@/components/ui";
import { CatalogTabs } from "../CatalogTabs";
import { CompareTable } from "./CompareTable";

export const metadata = { title: "Confronto cavalli" };

export default async function ComparePage() {
  const user = await requireUser("prices.view");
  const [{ meta, rows: all }, s] = await Promise.all([getCatalogRows(), getSettings()]);
  const rows = all.filter((r) => canSeeBreed(user.role, r.breedId));
  return (
    <>
      <PageHeader title="Catalogo e prezzi" subtitle="Scegli i cavalli e confrontali uno accanto all'altro: il migliore di ogni voce è evidenziato. Sotto trovi tutto il catalogo da ordinare." />
      <CatalogTabs active="confronto" />
      <CompareTable rows={rows} meta={meta} labels={{ a: `${s.minSaleAge}-${s.bracketAMax} anni`, b: `${s.bracketAMax + 1}-${s.bracketBMax} anni` }} maxCompare={s.compareMax} />
    </>
  );
}
