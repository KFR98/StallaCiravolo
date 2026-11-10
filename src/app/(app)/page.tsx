import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { salesSummary, dailyTrend, employeeStats, periods } from "@/lib/stats";
import { money, dateTime } from "@/lib/format";
import { formatAge } from "@/lib/age";
import { horseAge } from "@/lib/horses";
import { PageHeader, Panel, StatTile, Empty, TableWrap } from "@/components/ui";
import { SaleTypeBadge } from "@/components/StatusBadge";
import { SalesTrendChart } from "@/components/Charts";
import { weekLabel } from "@/lib/weeks";
import { TZ } from "@/lib/format";
import { userSalaryPercent } from "@/lib/payroll";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ negato?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const overview = can(user.role, "dashboard.overview");
  const mine = overview ? undefined : user.id;
  const p = periods();

  const [inStable, capturesWeek, capturesTotal, today, week, trend, lastHorses, lastSales, sellable] = await Promise.all([
    prisma.horse.count({ where: { status: "IN_STALLA" } }),
    prisma.horse.count({ where: { capturedAt: { gte: p.week }, ...(mine ? { capturedById: mine } : {}) } }),
    prisma.horse.count({ where: mine ? { capturedById: mine } : {} }),
    salesSummary(p.today, p.tomorrow, mine),
    salesSummary(p.week, p.nextWeek, mine),
    dailyTrend(14, mine),
    prisma.horse.findMany({
      where: { status: "IN_STALLA" },
      orderBy: { capturedAt: "desc" },
      take: 6,
      include: { breed: true, coat: true, capturedBy: { select: { displayName: true } } },
    }),
    prisma.sale.findMany({ where: { voided: false, ...(mine ? { sellerId: mine } : {}) }, orderBy: { soldAt: "desc" }, take: 6 }),
    prisma.horse.findMany({ where: { status: "IN_STALLA" }, select: { ageBase: true, ageCheckpointAt: true } }),
  ]);
  const sellableCount = sellable.filter((h) => horseAge({ ...h, coat: { salePriceA: null, salePriceB: null, governmentPrice: null } }, s) >= s.minSaleAge).length;
  const top = overview ? (await employeeStats(p.week, p.nextWeek)).filter((e) => e.sales || e.captures).sort((a, b) => b.revenue - a.revenue || b.captures - a.captures).slice(0, 5) : [];
  const pct = mine ? await userSalaryPercent(user.id) : 0;
  const salaryBase = (s.salaryIncludeGov ? week.govTotal : 0) + (s.salaryIncludeStable ? week.stableTotal : 0);

  return (
    <>
      <PageHeader
        title={overview ? "Ufficio della stalla" : `Buona giornata, ${user.displayName}`}
        subtitle={`${ROLE_LABELS[user.role]} · Settimana ${weekLabel(p.week, TZ)}`}
        actions={
          <>
            <Link href="/stalla/nuovo" className="btn btn-gold">+ Registra cattura</Link>
            <Link href="/stalla" className="btn btn-ghost !bg-paper/80">Cavalli in stalla</Link>
          </>
        }
      />
      {sp.negato && <div className="panel panel-pad mb-4 !border-blood text-blood">Non hai i permessi per accedere a quella pagina.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Cavalli in stalla" value={inStable} hint={`${sellableCount} vendibili`} href="/stalla" />
        <StatTile label={overview ? "Catture settimana" : "Mie catture sett."} value={capturesWeek} hint={`${capturesTotal} in totale`} />
        <StatTile label={overview ? "Vendite oggi" : "Mie vendite oggi"} value={today.count} hint={`${today.govCount} al Governo`} />
        <StatTile label={overview ? "Vendite settimana" : "Mie vendite sett."} value={week.count} hint={`${week.govCount} al Governo`} />
        <StatTile label="Incasso oggi" value={money(today.total)} />
        <StatTile label="Incasso settimana" value={money(week.total)} hint={!overview ? `Stipendio stimato ${money(Math.round(salaryBase * pct) / 100)}` : undefined} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel title={overview ? "Andamento vendite · ultimi 14 giorni" : "Le mie vendite · ultimi 14 giorni"}>
          <SalesTrendChart data={trend} />
        </Panel>
        {overview ? (
          <Panel title="Dipendenti più attivi · settimana" actions={can(user.role, "employees.stats") ? <Link href="/dipendenti" className="btn btn-ghost btn-sm">Dettagli</Link> : undefined}>
            {top.length === 0 ? <Empty>Nessuna attività questa settimana.</Empty> : (
              <ol className="space-y-2">
                {top.map((e, i) => (
                  <li key={e.userId} className="flex items-center gap-3 border-b border-dashed border-[#bfa476] pb-2">
                    <span className="title-western w-7 text-center text-[20px] text-gold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.name}</div>
                      <div className="text-[13.5px] text-ink-soft">{e.captures} catture · {e.sales} vendite ({e.govSales} Gov.)</div>
                    </div>
                    <b className="tabular-nums">{money(e.revenue)}</b>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        ) : (
          <Panel title="Riepilogo settimana">
            <div className="grid grid-cols-2 gap-y-2 text-[15.5px]">
              <span className="text-ink-soft">Vendite dalla stalla</span><b className="text-right">{week.stableCount} · {money(week.stableTotal)}</b>
              <span className="text-ink-soft">Vendite al Governo</span><b className="text-right">{week.govCount} · {money(week.govTotal)}</b>
              <span className="text-ink-soft">Percentuale stipendio</span><b className="text-right">{pct}%</b>
              <span className="text-ink-soft">Stipendio stimato</span><b className="text-right text-[18px]">{money(Math.round(salaryBase * pct) / 100)}</b>
            </div>
            <p className="mt-3 text-[13px] text-ink-soft italic">Stima calcolata sulle vendite registrate; l&apos;importo definitivo è stabilito dalla direzione.</p>
          </Panel>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Ultimi cavalli in stalla" actions={<Link href="/stalla" className="btn btn-ghost btn-sm">Tutti</Link>}>
          {lastHorses.length === 0 ? <Empty>La stalla è vuota.</Empty> : (
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Cavallo</th><th>Targa</th><th>Età</th><th>Catturato da</th></tr></thead>
                <tbody>
                  {lastHorses.map((h) => (
                    <tr key={h.id}>
                      <td><Link href={`/stalla/${h.id}`} className="underline decoration-dotted">{h.breed.name}</Link><div className="text-[13.5px] italic text-ink-soft">{h.coat.name}</div></td>
                      <td className="font-semibold">{h.plate}</td>
                      <td className="whitespace-nowrap">{formatAge(horseAge(h, s))}</td>
                      <td>{h.capturedBy.displayName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
        <Panel title={overview ? "Ultime vendite" : "Le mie ultime vendite"} actions={<Link href="/vendite" className="btn btn-ghost btn-sm">Registro</Link>}>
          {lastSales.length === 0 ? <Empty>Nessuna vendita registrata.</Empty> : (
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Data</th><th>Cavallo</th><th>Tipo</th><th className="num">Prezzo</th></tr></thead>
                <tbody>
                  {lastSales.map((x) => (
                    <tr key={x.id}>
                      <td className="whitespace-nowrap text-[14px]">{dateTime(x.soldAt)}</td>
                      <td>{x.breedName}<div className="text-[13.5px] italic text-ink-soft">{x.coatName}{overview ? ` · ${x.sellerName}` : ""}</div></td>
                      <td><SaleTypeBadge type={x.type} /></td>
                      <td className="num font-semibold">{money(x.finalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      </div>
    </>
  );
}
