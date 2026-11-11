import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { employeeStats } from "@/lib/stats";
import { money, TZ } from "@/lib/format";
import { weekStartOf, addWeeks, weekLabel } from "@/lib/weeks";
import { PageHeader, Card } from "@/components/ui";
import { UserTotalsCards, UserHistoryList, type HistorySearch } from "@/components/UserHistory";

export const metadata = { title: "Scheda stalliere" };

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<HistorySearch> }) {
  const me = await requireUser("employees.stats");
  const id = Number((await params).id) || 0;
  const sp = await searchParams;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const current = weekStartOf(new Date(), TZ);
  const weeks = await Promise.all(
    Array.from({ length: 8 }, (_, i) => addWeeks(current, -i, TZ)).map(async (w) => ({ w, s: (await employeeStats(w, addWeeks(w, 1, TZ))).find((e) => e.userId === id)! })),
  );
  return (
    <>
      <Link href="/dipendenti" className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Personale</Link>
      <PageHeader
        eyebrow={`${ROLE_LABELS[user.role]} · @${user.username}${user.active ? "" : " · disattivato"}`}
        title={user.displayName}
        actions={can(me.role, "payroll.manage") ? <Link href={`/stipendi/${user.id}`} className="btn btn-secondary">Stipendi</Link> : undefined}
      />
      <UserTotalsCards userId={user.id} />
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <UserHistoryList userId={user.id} sp={sp} basePath={`/dipendenti/${user.id}`} />
        <Card title="Ultime 8 settimane" pad={false} className="h-fit">
          <table className="tbl">
            <thead><tr><th className="!pl-5">Settimana</th><th className="num">Catture</th><th className="num">Vendite</th><th className="num !pr-5">Incasso</th></tr></thead>
            <tbody>
              {weeks.map(({ w, s }) => (
                <tr key={w.toISOString()}>
                  <td className="!pl-5 whitespace-nowrap">{weekLabel(w, TZ)}</td>
                  <td className="num">{s.captures}</td>
                  <td className="num">{s.sales}</td>
                  <td className="num !pr-5 font-semibold">{money(s.revenue + s.itemsRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
