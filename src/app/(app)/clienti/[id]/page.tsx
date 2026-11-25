import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { imageUrl } from "@/lib/catalog";
import { money, dateTime, dateOnly } from "@/lib/format";
import { salesFeed, sortFeed, feedTotals } from "@/lib/sales-feed";
import { PageHeader, Card, Empty, StatTile, HorseThumb } from "@/components/ui";
import { SaleTag } from "@/components/SaleTag";
import { CustomerButton, ManageCustomer } from "../CustomerForms";

export const metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("customers.view");
  const id = Number((await params).id) || 0;
  const c = await prisma.customer.findUnique({ where: { id }, include: { reservations: { orderBy: { updatedAt: "desc" }, take: 50, include: { breed: true, coat: true } } } });
  if (!c) notFound();
  // chi non vede le vendite di tutti vede solo le proprie, anche nella scheda cliente
  const feed = sortFeed(await salesFeed({ customerId: id, sellerId: can(user.role, "sales.viewAll") ? undefined : user.id }, imageUrl), "recenti");
  const tot = feedTotals(feed);
  const manage = can(user.role, "customers.manage");
  const others = manage ? (await prisma.customer.findMany({ where: { NOT: { id } }, orderBy: { name: "asc" }, select: { id: true, name: true } })) : [];
  const first = feed.length ? feed[feed.length - 1].soldAt : null;

  return (
    <>
      <Link href="/clienti" className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Clienti</Link>
      <PageHeader
        title={c.name}
        subtitle={[c.missiva && `Missiva ${c.missiva}`, c.contact, first && `cliente dal ${dateOnly(first)}`].filter(Boolean).join(" · ") || undefined}
        actions={manage ? <><CustomerButton customer={c} label="Modifica" className="btn btn-secondary" /><ManageCustomer customer={c} others={others} /></> : undefined}
      />
      {c.notes && <Card className="mb-5"><p className="whitespace-pre-wrap text-fg-2">{c.notes}</p></Card>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Ha speso" value={money(tot.total)} hint={`${tot.count} fatture`} tone="accent" />
        <StatTile label="Cavalli" value={money(tot.cavallo)} hint={`${tot.n.cavallo} comprati`} />
        <StatTile label="Addestramenti" value={money(tot.addestramento)} hint={`${tot.n.addestramento}`} />
        <StatTile label="Vetrina" value={money(tot.vetrina)} hint={`${tot.n.vetrina} fatture`} />
        <StatTile label="Prenotazioni" value={c.reservations.length} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Acquisti" pad={false} actions={<Link href={`/vendite?cliente=${id}`} className="btn btn-ghost btn-sm">Apri nelle vendite</Link>}>
          {feed.length === 0 ? <div className="card-pad"><Empty>Nessun acquisto collegato.</Empty></div> : (
            <ul className="divide-y divide-border">
              {feed.slice(0, 100).map((e) => (
                <li key={e.key} className={`flex items-center gap-3 px-4 py-2.5 sm:px-5 ${e.voided ? "opacity-55" : ""}`}>
                  {e.image ? <HorseThumb src={e.image} size={40} /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-3" aria-hidden="true">🛒</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">{e.tags.map((t) => <SaleTag key={t} kind={t} short />)}<span className={`truncate font-medium ${e.voided ? "line-through" : ""}`}>{e.title}</span></div>
                    <div className="text-[12.5px] text-fg-3">{dateTime(e.soldAt)} · {e.sellerName}{e.plate ? ` · ${e.plate}` : ""}</div>
                  </div>
                  <b className="tabular-nums">{money(e.total)}</b>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Prenotazioni in bacheca" pad={false}>
          {c.reservations.length === 0 ? <div className="card-pad"><Empty>Nessuna prenotazione.</Empty></div> : (
            <ul className="divide-y divide-border">
              {c.reservations.map((r) => (
                <li key={r.id} className="px-4 py-2.5 sm:px-5">
                  <div className="font-medium">{r.title || [r.breed?.name, r.coat?.name].filter(Boolean).join(" – ") || `Prenotazione #${r.id}`}</div>
                  <div className="text-[12.5px] text-fg-3">{r.status.replace(/_/g, " ").toLowerCase()}{r.price != null ? ` · ${money(r.price)}` : ""} · {dateOnly(r.updatedAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
