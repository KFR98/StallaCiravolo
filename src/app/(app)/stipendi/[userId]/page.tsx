import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { payrollOverview } from "@/lib/payroll";
import { money, dateTime, dateOnly, TZ } from "@/lib/format";
import { weekLabel } from "@/lib/weeks";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader, Panel, StatTile, TableWrap } from "@/components/ui";
import { WeekActions, PayArrearsButton, PercentForm } from "../PayrollControls";
import clsx from "clsx";

export const metadata = { title: "Stipendi dipendente" };

export default async function UserPayrollPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireUser("payroll.manage");
  const { userId } = await params;
  const id = Number(userId) || 0;
  const [ov] = await payrollOverview({ userId: id, includeInactive: true });
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const s = await getSettings();
  const payments = await prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { recordedBy: true } });
  const weeks = ov?.weeks ?? [];
  return (
    <>
      <PageHeader
        title={user.displayName}
        subtitle={`${ROLE_LABELS[user.role]} · stipendio ${ov?.percent ?? s.salaryPercent}% delle vendite`}
        actions={<Link href="/stipendi" className="btn btn-ghost !bg-paper/80">← Registro stipendi</Link>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Da pagare" value={money(ov?.due ?? 0)} hint={`${ov?.arrears.length ?? 0} settimane`} />
        <StatTile label="Ultimo pagamento" value={ov?.lastPaidAt ? dateOnly(ov.lastPaidAt) : "Mai"} hint={ov?.lastPaidWeek ? `fino a sett. ${weekLabel(ov.lastPaidWeek, TZ)}` : undefined} />
        <StatTile label="Settimana in corso" value={money(ov?.current?.amount ?? 0)} hint={`${ov?.current?.salesCount ?? 0} vendite`} />
        <StatTile label="Totale pagato" value={money(ov?.paidTotal ?? 0)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Settimane" actions={ov ? <PayArrearsButton userId={id} name={user.displayName} count={ov.arrears.length} total={ov.due} /> : undefined}>
          <TableWrap>
            <table className="ledger">
              <thead><tr><th>Settimana</th><th className="num">Vendite</th><th className="num">Totale</th><th className="num">%</th><th className="num">Stipendio</th><th>Stato</th><th /></tr></thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.key}>
                    <td className="whitespace-nowrap">{weekLabel(w.weekStart, TZ)}{w.inProgress && <span className="ml-1 text-[13px] italic text-ink-soft">(in corso)</span>}{w.notes && <div className="text-[13px] text-ink-soft">{w.notes}</div>}</td>
                    <td className="num">{w.salesCount}</td>
                    <td className="num">{money(w.salesTotal)}</td>
                    <td className="num">{w.percent}%</td>
                    <td className="num font-bold">{money(w.amount)}{w.overridden && <span className="text-blood">*</span>}</td>
                    <td><span className={clsx("badge", w.status === "PAGATO" ? "badge-green" : w.amount > 0 ? "badge-red" : "badge-ink")}>{w.status === "PAGATO" ? `Pagato ${dateOnly(w.paidAt)}` : w.amount > 0 ? "Da pagare" : "—"}</span></td>
                    <td><WeekActions userId={id} name={user.displayName} week={w.key} label={weekLabel(w.weekStart, TZ)} amount={w.amount} computed={w.computed} status={w.status} entryId={w.entryId} notes={w.notes} overridden={w.overridden} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
        <div className="space-y-5">
          <Panel title="Percentuale stipendio">
            <PercentForm userId={id} percent={ov?.percent ?? s.salaryPercent} custom={user.salaryPercent != null} globalPercent={s.salaryPercent} />
            <p className="mt-2 text-[13px] text-ink-soft italic">Lascia vuoto per usare la percentuale globale ({s.salaryPercent}%). Le settimane già pagate non cambiano.</p>
          </Panel>
          <Panel title="Storico pagamenti">
            {payments.length === 0 ? <p className="italic text-ink-soft">Nessun pagamento.</p> : (
              <ul className="space-y-2">
                {payments.map((p) => (
                  <li key={p.id} className="border-b border-dashed border-[#bfa476] pb-2 text-[15px]">
                    <div className="flex justify-between gap-2"><span>{weekLabel(p.weekStart, TZ)}</span><b>{money(p.amount)}</b></div>
                    <div className="text-[13.5px] text-ink-soft">
                      <span className={clsx("badge mr-1", p.action === "PAGATO" ? "badge-green" : "badge-red")}>{p.action === "PAGATO" ? "Pagato" : "Annullato"}</span>
                      {dateTime(p.createdAt)} · {p.recordedBy?.displayName ?? "—"}{p.notes ? ` · ${p.notes}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
