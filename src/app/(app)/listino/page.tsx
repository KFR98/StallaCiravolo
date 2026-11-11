import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getCatalogRows } from "@/lib/catalog";
import { PageHeader } from "@/components/ui";
import { CatalogTabs } from "../CatalogTabs";
import { PriceList } from "./PriceList";

export const metadata = { title: "Listino prezzi" };

export default async function PriceListPage() {
  const user = await requireUser("prices.view");
  const [{ rows }, s] = await Promise.all([getCatalogRows(), getSettings()]);
  return (
    <>
      <PageHeader
        title="Catalogo e prezzi"
        subtitle={`Listino ufficiale in un unico foglio. Sotto i ${s.minSaleAge} anni il cavallo non è vendibile, oltre i ${s.bracketBMax} il prezzo è libero.`}
        actions={
          <>
            {can(user.role, "catalog.manage") && <Link href="/admin/catalogo" className="btn btn-secondary">Modifica prezzi</Link>}
            {can(user.role, "data.export") && <a href="/api/export/listino" className="btn btn-secondary">Esporta Excel</a>}
          </>
        }
      />
      <CatalogTabs active="listino" />
      <PriceList rows={rows} labels={{ a: `${s.minSaleAge}-${s.bracketAMax}`, b: `${s.bracketAMax + 1}-${s.bracketBMax}` }} />
    </>
  );
}
