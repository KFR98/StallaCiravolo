import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { employeeStats } from "@/lib/stats";
import { imageUrl } from "@/lib/catalog";
import { money, dateTime, TZ } from "@/lib/format";
import { weekStartOf, addWeeks, isoWeekKey, parseWeekKey, weekLabel } from "@/lib/weeks";
import { PageHeader, Card, StatTile, TableWrap, Empty, HorseName } from "@/components/ui";
import { SaleTypeBadge, StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Scheda stalliere" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ settimana?: string }> }) {
  await requireUser("employees.stats");
  const id = Number((await params).id) || 0;
  const sp = await searchParams;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const current = weekStartOf(new Date(), TZ);
  const week = (sp.settimana && parseWeekKey(sp.settimana, TZ)) || current;
  const next = addWeeks(week, 1, TZ);
  const all = (await employeeStats()).find((e) => e.userId === id)!;
  const weeks = await Promise.all(
    Array.from({ length: 8 }, (_, i) => addWeeks(current, -i, TZ)).map(async (w) => ({ w, s: (await employeeStats(w, addWeeks(w, 1, TZ))).find((e) => e.userId === id)! })),
  );
  const [captures, sales, log] = await Promise.all([
    prisma.horse.findMany({ where: { capturedById: id, capturedAt: { gte: week, lt: next } }, include: { breed: true, coat: true }, orderBy: { capturedAt: "desc" } }),
    prisma.sale.findMany({ where: { sellerId: id, soldAt: { gte: week, lt: next } }, orderBy: { soldAt: "desc" }, include: { horse: { include: { coat: true } } } }),
    prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <Link href="/dipendenti" className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Personale</Link>
      <PageHeader title={user.displayName} subtitle={`${ROLE_LABELS[user.role]} · @${user.username}${user.active ? "" : " · disattivato"}`} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Catture" value={all.captures} />
        <StatTile label="Depositati" value={all.deposits} />
        <StatTile label="Vendite stalla" value={all.stableSales} />
        <StatTile label="Vendite blip" value={all.govSales} />
        <StatTile label="Oggetti" value={money(all.itemsRevenue)} />
        <StatTile label="Incasso totale" value={money(all.revenue + all.itemsRevenue)} tone="accent" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Card title="Ultime 8 settimane" pad={false}>
          <table className="tbl">
            <thead><tr><th className="!pl-5">Settimana</th><th className="num">Catture</th><th className="num">Vendite</th><th className="num !pr-5">Incasso</th></tr></thead>
            <tbody>
              {weeks.map(({ w, s }) => (
                <tr key={w.toISOString()} className={isoWeekKey(w, TZ) === isoWeekKey(week, TZ) ? "[&>td]:!bg-surface-3" : ""}>
                  <td className="!pl-5"><Link href={`/dipendenti/${id}?settimana=${isoWeekKey(w, TZ)}`} className="hover:text-accent-text">{weekLabel(w, TZ)}</Link></td>
                  <td className="num">{s.captures}</td><td className="num">{s.sales}</td><td className="num !pr-5 font-semibold">{money(s.revenue + s.itemsRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={`Operazioni · ${weekLabel(week, TZ)}`}>
          <h3 className="eyebrow mb-2">Vendite ({sales.length})</h3>
          {sales.length === 0 ? <p className="mb-4 text-fg-3">Nessuna vendita.</p> : (
            <TableWrap>
              <table className="tbl mb-4">
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className={s.voided ? "line-through opacity-50" : ""}>
                      <td><HorseName image={imageUrl(s.horse.coat.imagePath)} breed={s.breedName} coat={s.coatName} size={30} /></td>
                      <td className="text-[13px] whitespace-nowrap text-fg-3">{dateTime(s.soldAt)}</td>
                      <td><SaleTypeBadge type={s.type} /></td>
                      <td className="num font-semibold">{money(s.finalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <h3 className="eyebrow mb-2">Catture ({captures.length})</h3>
          {captures.length === 0 ? <p className="text-fg-3">Nessuna cattura.</p> : (
            <TableWrap>
              <table className="tbl">
                <tbody>
                  {captures.map((h) => (
                    <tr key={h.id}>
                      <td><HorseName image={imageUrl(h.coat.imagePath)} breed={h.breed.name} coat={h.coat.name} href={`/stalla/${h.id}`} size={30} /></td>
                      <td className="text-[13px] whitespace-nowrap text-fg-3">{dateTime(h.capturedAt)}</td>
                      <td className="font-mono">{h.plate ?? "—"}</td>
                      <td><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </div>
      <Card title="Attività recenti" className="mt-5">
        {log.length === 0 ? <Empty>Nessuna attività.</Empty> : (
          <ul className="divide-y divide-border text-[14px]">
            {log.map((l) => <li key={l.id} className="py-2"><span className="text-fg-3">{dateTime(l.createdAt)}</span> · {l.summary}</li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
