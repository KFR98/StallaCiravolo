import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getCatalogRows } from "@/lib/catalog";
import { PageHeader } from "@/components/ui";
import { CatalogTabs } from "../CatalogTabs";
import { CatalogBrowser } from "./CatalogBrowser";

export const metadata = { title: "Catalogo" };

export default async function CatalogPage() {
  const user = await requireUser("catalog.view");
  const [{ meta, rows }, s] = await Promise.all([getCatalogRows(), getSettings()]);
  return (
    <>
      <PageHeader
        title="Catalogo e prezzi"
        subtitle="Tutte le razze e i manti con statistiche e prezzi. Le barre confrontano ogni statistica con il miglior cavallo del catalogo."
        actions={can(user.role, "catalog.manage") ? <Link href="/admin/catalogo" className="btn btn-secondary">Gestisci catalogo</Link> : undefined}
      />
      <CatalogTabs active="catalogo" />
      <CatalogBrowser rows={rows} meta={meta} labels={{ a: `${s.minSaleAge}-${s.bracketAMax}`, b: `${s.bracketAMax + 1}-${s.bracketBMax}` }} />
    </>
  );
}
