import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { employeeStats } from "@/lib/stats";
import { money, dateTime, TZ } from "@/lib/format";
import { weekStartOf, addWeeks, isoWeekKey, parseWeekKey, weekLabel } from "@/lib/weeks";
import { PageHeader, Panel, TableWrap, Empty } from "@/components/ui";
import { EmployeeChart } from "@/components/Charts";
import clsx from "clsx";

export const metadata = { title: "Dipendenti" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ settimana?: string; periodo?: string }> }) {
  const user = await requireUser("employees.list");
  const sp = await searchParams;

  if (!can(user.role, "employees.stats")) {
    const users = await prisma.user.findMany({ where: { active: true }, orderBy: { displayName: "asc" } });
    return (
      <>
        <PageHeader title="Dipendenti" subtitle="Personale attivo della stalla." />
        <Panel>
          <TableWrap>
            <table className="ledger">
              <thead><tr><th>Nome</th><th>Ruolo</th><th>Ultimo accesso</th></tr></thead>
              <tbody>{users.map((u) => <tr key={u.id}><td className="font-semibold">{u.displayName}</td><td>{ROLE_LABELS[u.role]}</td><td>{dateTime(u.lastLoginAt)}</td></tr>)}</tbody>
            </table>
          </TableWrap>
        </Panel>
      </>
    );
  }

  const allTime = sp.periodo === "sempre";
  const current = weekStartOf(new Date(), TZ);
  const week = (sp.settimana && parseWeekKey(sp.settimana, TZ)) || current;
  const stats = allTime ? await employeeStats() : await employeeStats(week, addWeeks(week, 1, TZ));
  const rows = stats.filter((e) => e.active || e.captures || e.sales).sort((a, b) => b.revenue - a.revenue || b.captures - a.captures);
  const chart = rows.filter((r) => r.role !== "ADMIN" || r.sales || r.captures).map((r) => ({ name: r.name, incasso: Math.round(r.revenue), catture: r.captures, vendite: r.sales }));
  const tot = rows.reduce((t, r) => ({ c: t.c + r.captures, s: t.s + r.sales, r: t.r + r.revenue }), { c: 0, s: 0, r: 0 });

  return (
    <>
      <PageHeader title="Rendimento dipendenti" subtitle={allTime ? "Risultati complessivi da sempre." : `Settimana ${weekLabel(week, TZ)}${isoWeekKey(week, TZ) === isoWeekKey(current, TZ) ? " (in corso)" : ""}`} />
      <Panel className="mb-5">
        <form className="flex flex-wrap items-center gap-2">
          <Link className={clsx("btn btn-sm", !allTime ? "btn-gold" : "btn-ghost")} href={`/dipendenti?settimana=${isoWeekKey(week, TZ)}`}>Per settimana</Link>
          <Link className={clsx("btn btn-sm", allTime ? "btn-gold" : "btn-ghost")} href="/dipendenti?periodo=sempre">Da sempre</Link>
          {!allTime && (
            <>
              <span className="mx-2 h-6 w-px bg-leather/30" />
              <Link className="btn btn-ghost btn-sm" href={`/dipendenti?settimana=${isoWeekKey(addWeeks(week, -1, TZ), TZ)}`}>← Precedente</Link>
              <input type="date" name="settimana" defaultValue={isoWeekKey(week, TZ)} className="input !w-44 !py-1" />
              <button className="btn btn-primary btn-sm">Vai</button>
              <Link className="btn btn-ghost btn-sm" href={`/dipendenti?settimana=${isoWeekKey(addWeeks(week, 1, TZ), TZ)}`}>Successiva →</Link>
            </>
          )}
          <span className="ml-auto text-ink-soft">Totale: <b>{tot.c}</b> catture · <b>{tot.s}</b> vendite · <b>{money(tot.r)}</b></span>
        </form>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Schede dipendenti">
          {rows.length === 0 ? <Empty>Nessun dipendente.</Empty> : (
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Dipendente</th><th className="num">Catturati</th><th className="num">Depositati</th><th className="num">Vendite</th><th className="num">Governo</th><th className="num">Stalla</th><th className="num">Incasso</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td><Link href={`/dipendenti/${r.userId}${allTime ? "" : `?settimana=${isoWeekKey(week, TZ)}`}`} className="font-semibold underline decoration-dotted">{r.name}</Link><div className="text-[13px] text-ink-soft">{ROLE_LABELS[r.role as keyof typeof ROLE_LABELS]}{!r.active && " · disattivato"}</div></td>
                      <td className="num">{r.captures}</td>
                      <td className="num">{r.deposits}</td>
                      <td className="num font-semibold">{r.sales}</td>
                      <td className="num">{r.govSales}</td>
                      <td className="num">{r.stableSales}</td>
                      <td className="num font-bold">{money(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
        <Panel title="Confronto">
          {chart.length ? <EmployeeChart data={chart} /> : <Empty>Nessun dato.</Empty>}
        </Panel>
      </div>
    </>
  );
}
