import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { salesSummary, dailyTrend, employeeStats, periods } from "@/lib/stats";
import { imageUrl } from "@/lib/catalog";
import { money, dateTime, TZ } from "@/lib/format";
import { formatAge } from "@/lib/age";
import { horseAge, pregnancyState } from "@/lib/horses";
import { currentWeekEstimate } from "@/lib/payroll";
import { weekLabel } from "@/lib/weeks";
import { PageHeader, Card, StatTile, Empty, HorseName } from "@/components/ui";
import { SaleTypeBadge, PregnancyBadge } from "@/components/StatusBadge";
import { SalesTrendChart } from "@/components/Charts";
import { WeeklyChampion } from "@/components/WeeklyChampion";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ negato?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const s = await getSettings();
  const overview = can(user.role, "dashboard.overview");
  const mine = overview ? undefined : user.id;
  const p = periods();

  const [stable, capturesWeek, today, week, trend, lastSales, myWeek] = await Promise.all([
    prisma.horse.findMany({
      where: { status: "IN_STALLA" },
      orderBy: { capturedAt: "desc" },
      include: { breed: true, coat: { select: { imagePath: true, name: true } }, owner: { select: { displayName: true } } },
    }),
    prisma.horse.count({ where: { capturedAt: { gte: p.week }, ...(mine ? { capturedById: mine } : {}) } }),
    salesSummary(p.today, p.tomorrow, mine),
    salesSummary(p.week, p.nextWeek, mine),
    dailyTrend(14, mine),
    prisma.sale.findMany({ where: { voided: false, ...(mine ? { sellerId: mine } : {}) }, orderBy: { soldAt: "desc" }, take: 6, include: { horse: { include: { coat: { select: { imagePath: true } } } } } }),
    mine ? currentWeekEstimate(user.id) : Promise.resolve(null),
  ]);
  const sellable = stable.filter((h) => (horseAge(h, s) ?? 0) >= s.minSaleAge).length;
  const myHorses = stable.filter((h) => h.ownerId === user.id);
  const toFoal = stable.filter((h) => pregnancyState(h) === "PARTO" && (overview || h.ownerId === user.id));
  const top = overview ? (await employeeStats(p.week, p.nextWeek)).filter((e) => e.sales || e.captures).sort((a, b) => b.revenue - a.revenue || b.captures - a.captures).slice(0, 5) : [];
  const recentHorses = (mine ? myHorses : stable).slice(0, 6);

  return (
    <>
      <PageHeader eyebrow={`${ROLE_LABELS[user.role]} · settimana ${weekLabel(p.week, TZ)}`} title={overview ? "Ufficio" : `Ciao, ${user.displayName}`} />
      {sp.negato && <div className="card mb-4 border-accent p-3 text-accent-text">Non hai i permessi per accedere a quella pagina.</div>}

      {toFoal.length > 0 && (
        <div className="card mb-5 flex flex-wrap items-center gap-3 border-warn-strong/60 p-3">
          <span className="badge badge-solid-warn">FAI PARTORIRE</span>
          <span className="text-[14.5px]">{toFoal.map((h) => <Link key={h.id} href={`/stalla/${h.id}`} className="mr-3 font-semibold underline">{h.breed.name} {h.plate}</Link>)}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Cavalli in stalla" value={stable.length} hint={`${sellable} vendibili`} href="/stalla" />
        <StatTile label={overview ? "Catture settimana" : "Le mie catture"} value={capturesWeek} hint="questa settimana" />
        <StatTile label={overview ? "Vendite oggi" : "Mie vendite oggi"} value={today.count} hint={`${today.govCount} al blip`} />
        <StatTile label={overview ? "Vendite settimana" : "Mie vendite sett."} value={week.count} hint={`${week.govCount} al blip`} />
        <StatTile label="Incasso oggi" value={money(today.total)} />
        {mine ? (
          <StatTile label="Stipendio stimato" value={money(myWeek?.due ?? 0)} hint="settimana in corso" tone="accent" />
        ) : (
          <StatTile label="Incasso settimana" value={money(week.total)} tone="accent" />
        )}
      </div>

      <div className="mt-5"><WeeklyChampion /></div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card title={overview ? "Vendite · ultimi 14 giorni" : "Le mie vendite · 14 giorni"}><SalesTrendChart data={trend} /></Card>
        {overview ? (
          <Card title="Più attivi questa settimana" actions={can(user.role, "employees.stats") ? <Link href="/dipendenti" className="btn btn-ghost btn-sm">Dettagli</Link> : undefined}>
            {top.length === 0 ? <Empty>Nessuna attività questa settimana.</Empty> : (
              <ol className="divide-y divide-border">
                {top.map((e, i) => (
                  <li key={e.userId} className="flex items-center gap-3 py-2.5">
                    <span className="h-display w-6 text-center text-[20px] text-accent-text">{i + 1}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{e.name}</div><div className="text-[13px] text-fg-3">{e.captures} catture · {e.sales} vendite</div></div>
                    <b className="tabular-nums">{money(e.revenue)}</b>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        ) : (
          <Card title="I miei cavalli" actions={<Link href="/stalla" className="btn btn-ghost btn-sm">Stalla</Link>}>
            {myHorses.length === 0 ? <Empty>Non hai cavalli in carico.</Empty> : (
              <ul className="divide-y divide-border">
                {myHorses.slice(0, 6).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                    <HorseName image={imageUrl(h.coat.imagePath)} breed={h.breed.name} coat={h.coat.name} href={`/stalla/${h.id}`} sub={h.plate ?? undefined} />
                    <PregnancyBadge dueAt={h.pregnancyDueAt} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title={mine ? "Ultimi miei cavalli" : "Ultimi arrivati in stalla"} actions={<Link href="/stalla" className="btn btn-ghost btn-sm">Tutti</Link>}>
          {recentHorses.length === 0 ? <Empty>La stalla è vuota.</Empty> : (
            <ul className="divide-y divide-border">
              {recentHorses.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <HorseName image={imageUrl(h.coat.imagePath)} breed={h.breed.name} coat={h.coat.name} href={`/stalla/${h.id}`} sub={`${formatAge(horseAge(h, s) ?? 0)} · ${h.owner.displayName}`} />
                  <span className="badge badge-neutral font-mono">{h.plate}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={overview ? "Ultime vendite" : "Le mie ultime vendite"} actions={<Link href="/vendite" className="btn btn-ghost btn-sm">Registro</Link>}>
          {lastSales.length === 0 ? <Empty>Nessuna vendita registrata.</Empty> : (
            <ul className="divide-y divide-border">
              {lastSales.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                  <HorseName image={imageUrl(x.horse.coat.imagePath)} breed={x.breedName} coat={x.coatName} sub={`${dateTime(x.soldAt)}${overview ? " · " + x.sellerName : ""}`} />
                  <div className="flex shrink-0 items-center gap-2"><SaleTypeBadge type={x.type} /><b className="tabular-nums">{money(x.finalPrice)}</b></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
