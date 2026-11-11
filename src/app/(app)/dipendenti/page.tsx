import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { employeeStats } from "@/lib/stats";
import { money, dateTime, TZ } from "@/lib/format";
import { weekStartOf, addWeeks, isoWeekKey, parseWeekKey, weekLabel } from "@/lib/weeks";
import { PageHeader, Card, Empty } from "@/components/ui";
import { EmployeeChart } from "@/components/Charts";
import { StaffTabs } from "../StaffTabs";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "Personale" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ settimana?: string; periodo?: string }> }) {
  const user = await requireUser("employees.list");
  const sp = await searchParams;

  if (!can(user.role, "employees.stats")) {
    const users = await prisma.user.findMany({ where: { active: true }, orderBy: { displayName: "asc" } });
    return (
      <>
        <PageHeader title="Personale" subtitle="Stallieri attivi." />
        <Card pad={false}>
          <table className="tbl">
            <thead><tr><th className="!pl-5">Nome</th><th>Ruolo</th><th>Ultimo accesso</th></tr></thead>
            <tbody>{users.map((u) => <tr key={u.id}><td className="!pl-5 font-semibold">{u.displayName}</td><td>{ROLE_LABELS[u.role]}</td><td>{dateTime(u.lastLoginAt)}</td></tr>)}</tbody>
          </table>
        </Card>
      </>
    );
  }

  const allTime = sp.periodo === "sempre";
  const current = weekStartOf(new Date(), TZ);
  const week = (sp.settimana && parseWeekKey(sp.settimana, TZ)) || current;
  const stats = allTime ? await employeeStats() : await employeeStats(week, addWeeks(week, 1, TZ));
  const rows = stats.filter((e) => e.active || e.captures || e.sales).sort((a, b) => b.revenue + b.itemsRevenue - (a.revenue + a.itemsRevenue) || b.captures - a.captures);
  const chart = rows.filter((r) => r.role !== "ADMIN" || r.sales || r.captures).map((r) => ({ name: r.name, incasso: Math.round(r.revenue + r.itemsRevenue), catture: r.captures, vendite: r.sales }));
  const wk = (w: Date) => isoWeekKey(w, TZ);

  return (
    <>
      <PageHeader title="Personale" subtitle="Rendimento degli stallieri: catture, vendite e incassi." />
      <StaffTabs role={user.role} active="dipendenti" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link className="chip" aria-pressed={!allTime} href={`/dipendenti?settimana=${wk(week)}`}>Per settimana</Link>
        <Link className="chip" aria-pressed={allTime} href="/dipendenti?periodo=sempre">Da sempre</Link>
        {!allTime && (
          <div className="ml-auto flex items-center gap-1">
            <Link className="btn btn-ghost btn-icon" aria-label="Settimana precedente" href={`/dipendenti?settimana=${wk(addWeeks(week, -1, TZ))}`}><ChevronLeft size={18} /></Link>
            <span className="min-w-[170px] text-center font-semibold">{weekLabel(week, TZ)}</span>
            <Link className="btn btn-ghost btn-icon" aria-label="Settimana successiva" href={`/dipendenti?settimana=${wk(addWeeks(week, 1, TZ))}`}><ChevronRight size={18} /></Link>
          </div>
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Card pad={false}>
          {rows.length === 0 ? <Empty>Nessun dipendente.</Empty> : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th className="!pl-5">Stalliere</th><th className="num">Catture</th><th className="num">In stalla</th><th className="num">Vendite</th><th className="num">di cui blip</th><th className="num">Oggetti</th><th className="num !pr-5">Incasso</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="!pl-5"><Link href={`/dipendenti/${r.userId}${allTime ? "" : `?settimana=${wk(week)}`}`} className="font-semibold hover:text-accent-text">{r.name}</Link><div className="text-[12.5px] text-fg-3">{ROLE_LABELS[r.role as keyof typeof ROLE_LABELS]}</div></td>
                      <td className="num">{r.captures}</td>
                      <td className="num">{r.deposits}</td>
                      <td className="num font-semibold">{r.sales}</td>
                      <td className="num">{r.govSales}</td>
                      <td className="num">{money(r.itemsRevenue)}</td>
                      <td className="num !pr-5 font-bold">{money(r.revenue + r.itemsRevenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Confronto">{chart.length ? <EmployeeChart data={chart} /> : <Empty>Nessun dato.</Empty>}</Card>
      </div>
    </>
  );
}
