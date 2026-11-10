import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { employeeStats } from "@/lib/stats";
import { money, dateTime, TZ } from "@/lib/format";
import { weekStartOf, addWeeks, isoWeekKey, parseWeekKey, weekLabel } from "@/lib/weeks";
import { PageHeader, Panel, StatTile, TableWrap, Empty } from "@/components/ui";
import { SaleTypeBadge, StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Scheda dipendente" };

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
    prisma.sale.findMany({ where: { sellerId: id, soldAt: { gte: week, lt: next } }, orderBy: { soldAt: "desc" } }),
    prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <PageHeader
        title={user.displayName}
        subtitle={`${ROLE_LABELS[user.role]} · @${user.username}${user.active ? "" : " · account disattivato"}`}
        actions={<Link href="/dipendenti" className="btn btn-ghost !bg-paper/80">← Dipendenti</Link>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Catturati" value={all.captures} />
        <StatTile label="Depositati" value={all.deposits} />
        <StatTile label="Vendite" value={all.sales} />
        <StatTile label="Al Governo" value={all.govSales} />
        <StatTile label="Dalla stalla" value={all.stableSales} />
        <StatTile label="Incasso generato" value={money(all.revenue)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="Ultime 8 settimane">
          <TableWrap>
            <table className="ledger">
              <thead><tr><th>Settimana</th><th className="num">Catture</th><th className="num">Vendite</th><th className="num">Totale</th></tr></thead>
              <tbody>
                {weeks.map(({ w, s }) => (
                  <tr key={w.toISOString()} className={isoWeekKey(w, TZ) === isoWeekKey(week, TZ) ? "[&>td]:bg-gold-bright/20" : ""}>
                    <td><Link href={`/dipendenti/${id}?settimana=${isoWeekKey(w, TZ)}`} className="underline decoration-dotted">{weekLabel(w, TZ)}</Link></td>
                    <td className="num">{s.captures}</td>
                    <td className="num">{s.sales}</td>
                    <td className="num font-semibold">{money(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
        <Panel title={`Dettaglio operazioni · ${weekLabel(week, TZ)}`}>
          <h3 className="label mb-2">Vendite ({sales.length})</h3>
          {sales.length === 0 ? <p className="mb-4 italic text-ink-soft">Nessuna vendita.</p> : (
            <TableWrap>
              <table className="ledger mb-4">
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className={s.voided ? "line-through opacity-50" : ""}>
                      <td className="whitespace-nowrap text-[14px]">{dateTime(s.soldAt)}</td>
                      <td>{s.breedName} <span className="italic text-ink-soft">– {s.coatName}</span></td>
                      <td><SaleTypeBadge type={s.type} /></td>
                      <td className="num font-semibold">{money(s.finalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          <h3 className="label mb-2">Catture ({captures.length})</h3>
          {captures.length === 0 ? <p className="italic text-ink-soft">Nessuna cattura.</p> : (
            <TableWrap>
              <table className="ledger">
                <tbody>
                  {captures.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap text-[14px]">{dateTime(h.capturedAt)}</td>
                      <td><Link href={`/stalla/${h.id}`} className="underline decoration-dotted">{h.breed.name}</Link> <span className="italic text-ink-soft">– {h.coat.name}</span></td>
                      <td>{h.plate}</td>
                      <td><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      </div>
      <Panel title="Storico operazioni" className="mt-5">
        {log.length === 0 ? <Empty>Nessuna attività registrata.</Empty> : (
          <ul className="space-y-1.5 text-[15px]">
            {log.map((l) => <li key={l.id} className="border-b border-dashed border-[#bfa476] pb-1"><span className="text-ink-soft">{dateTime(l.createdAt)}</span> · {l.summary}</li>)}
          </ul>
        )}
      </Panel>
    </>
  );
}
