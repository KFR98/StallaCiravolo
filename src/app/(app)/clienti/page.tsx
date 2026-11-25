import Link from "next/link";
import { Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { money, dateOnly } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { PageHeader, Card, Empty } from "@/components/ui";
import { ClientTabs } from "../ClientTabs";
import { CustomerButton } from "./CustomerForms";

export const metadata = { title: "Clienti" };

const SORTS = [["spesa", "Chi spende di più"], ["recenti", "Acquisto più recente"], ["nome", "Alfabetico (A→Z)"], ["acquisti", "Più acquisti"]] as const;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; ordina?: string }> }) {
  const user = await requireUser("customers.view");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80);
  const customers = await prisma.customer.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { missiva: { contains: q } }, { contact: { contains: q } }] } : {},
    include: { _count: { select: { reservations: true } } },
    take: 2000,
  });
  const ids = customers.map((c) => c.id);
  // chi non vede le vendite di tutti vede nei totali solo le proprie (come nella pagina Vendite)
  const own = can(user.role, "sales.viewAll") ? {} : { sellerId: user.id };
  const [sales, items] = await Promise.all([
    prisma.sale.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, voided: false, ...own }, _sum: { finalPrice: true }, _count: true, _max: { soldAt: true } }),
    // le fatture collegate a un cavallo sono già contate nell'acquisto del cavallo come pezzo dello stesso conto, ma il totale va sommato
    prisma.itemSale.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, voided: false, ...own }, _sum: { total: true }, _count: true, _max: { soldAt: true } }),
  ]);
  const stats = new Map<number, { spent: number; count: number; last: Date | null }>();
  for (const c of customers) stats.set(c.id, { spent: 0, count: 0, last: null });
  for (const g of [...sales.map((x) => ({ id: x.customerId!, sum: Number(x._sum.finalPrice ?? 0), n: x._count, last: x._max.soldAt })), ...items.map((x) => ({ id: x.customerId!, sum: Number(x._sum.total ?? 0), n: x._count, last: x._max.soldAt }))]) {
    const st = stats.get(g.id);
    if (!st) continue;
    st.spent = round2(st.spent + g.sum);
    st.count += g.n;
    if (g.last && (!st.last || g.last > st.last)) st.last = g.last;
  }
  const sort = SORTS.some(([k]) => k === sp.ordina) ? sp.ordina! : "spesa";
  const list = [...customers].sort((a, b) => {
    const x = stats.get(a.id)!, y = stats.get(b.id)!;
    if (sort === "nome") return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
    if (sort === "recenti") return (y.last?.getTime() ?? 0) - (x.last?.getTime() ?? 0);
    if (sort === "acquisti") return y.count - x.count || y.spent - x.spent;
    return y.spent - x.spent || a.name.localeCompare(b.name, "it");
  });

  return (
    <>
      <PageHeader
        title="Clienti"
        subtitle="La rubrica si riempie da sola con chi compra (si può spegnere in Impostazioni). Tocca un cliente per vedere tutto quello che ha comprato."
        actions={<CustomerButton label="+ Nuovo cliente" className="btn btn-primary" />}
      />
      <ClientTabs role={user.role} active="clienti" />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-[2fr_1fr_auto]">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input name="q" defaultValue={sp.q} className="input !pl-9" placeholder="Cerca nome, missiva, contatto…" aria-label="Cerca cliente" />
        </div>
        <select name="ordina" defaultValue={sort} className="input" aria-label="Ordina">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn btn-secondary">Cerca</button>
      </form>
      <Card pad={false}>
        {list.length === 0 ? <div className="card-pad"><Empty>{q ? "Nessun cliente trovato." : "La rubrica è ancora vuota: si riempie con le vendite."}</Empty></div> : (
          <ul className="divide-y divide-border">
            {list.map((c) => {
              const st = stats.get(c.id)!;
              return (
                <li key={c.id}>
                  <Link href={`/clienti/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 font-display text-[16px] font-bold uppercase">{c.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="block text-[13px] text-fg-3">
                        {[c.missiva && `✉ ${c.missiva}`, `${st.count} ${st.count === 1 ? "acquisto" : "acquisti"}`, c._count.reservations ? `${c._count.reservations} prenotazioni` : null, st.last && `ultimo ${dateOnly(st.last)}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <b className="tabular-nums">{money(st.spent)}</b>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {!can(user.role, "customers.manage") && <p className="mt-3 text-[13px] text-fg-3">Per correggere o unire due schede dello stesso cliente chiedi alla direzione.</p>}
    </>
  );
}
