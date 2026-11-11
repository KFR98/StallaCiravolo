import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { payrollOverview } from "@/lib/payroll";
import { money, dateTime, dateOnly, TZ } from "@/lib/format";
import { weekLabel } from "@/lib/weeks";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader, Card, StatTile, TableWrap } from "@/components/ui";
import { PayButton, WeekMenu, PercentForm } from "../PayrollControls";

export const metadata = { title: "Stipendi dipendente" };

const STATUS = { DA_PAGARE: ["Da pagare", "badge-warn"], PARZIALE: ["Parziale", "badge-warn"], PAGATO: ["Pagato", "badge-ok"] } as const;

export default async function UserPayrollPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireUser("payroll.manage");
  const id = Number((await params).userId) || 0;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) notFound();
  const [[ov], s, payments] = await Promise.all([
    payrollOverview({ userId: id }),
    getSettings(),
    prisma.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, include: { recordedBy: true } }),
  ]);
  const weeks = ov?.weeks ?? [];
  return (
    <>
      <Link href="/stipendi" className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Stipendi</Link>
      <PageHeader title={user.displayName} subtitle={ROLE_LABELS[user.role]} actions={ov && <PayButton userId={id} name={user.displayName} due={ov.due} weeks={ov.arrears.map((w) => weekLabel(w.weekStart, TZ).split(" – ")[0])} currentDue={ov.current?.residual ?? 0} className="btn btn-primary" />} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gli spetta" value={money(ov?.due ?? 0)} hint={`${ov?.arrears.length ?? 0} settimane`} tone="accent" />
        <StatTile label="Ultimo pagamento" value={ov?.lastPaidAt ? dateOnly(ov.lastPaidAt) : "Mai"} />
        <StatTile label="Settimana in corso" value={money(ov?.current?.due ?? 0)} hint={`${ov?.current?.totals.count ?? 0} vendite`} />
        <StatTile label="Totale pagato" value={money(ov?.paidTotal ?? 0)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Card title="Settimane" pad={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th className="!pl-5">Settimana</th><th className="num">Stalla</th><th className="num">Blip</th><th className="num">Oggetti</th><th className="num">Spetta</th><th className="num">Pagato</th><th>Stato</th><th className="!pr-5" /></tr></thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.key}>
                    <td className="!pl-5 whitespace-nowrap">{weekLabel(w.weekStart, TZ)}{w.inProgress && <span className="badge badge-info ml-1">in corso</span>}{w.notes && <div className="text-[12.5px] text-fg-3">{w.notes}</div>}</td>
                    <td className="num">{money(w.totals.stable)}</td>
                    <td className="num">{money(w.totals.gov)}</td>
                    <td className="num">{money(w.totals.items)}</td>
                    <td className="num font-semibold">{money(w.due)}{w.overridden && <span className="text-accent-text" title="Dovuto modificato a mano">*</span>}</td>
                    <td className="num">{money(w.paid)}{w.extra > 0 && <div className="text-[12px] text-ok">+{money(w.extra)} extra</div>}{w.status === "PARZIALE" && <div className="text-[12px] text-warn">manca {money(w.residual)}</div>}</td>
                    <td><span className={`badge ${w.due <= 0 && w.paid <= 0 ? "badge-neutral" : STATUS[w.status][1]}`}>{w.due <= 0 && w.paid <= 0 ? "—" : STATUS[w.status][0]}</span></td>
                    <td className="!pr-5 text-right"><WeekMenu userId={id} week={w.key} label={weekLabel(w.weekStart, TZ)} due={w.due} residual={w.residual} computed={w.computed} overridden={w.overridden} notes={w.notes} entryId={w.entryId} paid={w.paid} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Percentuali personali">
            <PercentForm
              userId={id}
              values={{ stable: user.pctStable?.toString() ?? "", gov: user.pctGov?.toString() ?? "", items: user.pctItems?.toString() ?? "" }}
              globals={{ stable: s.pctStable, gov: s.pctGov, items: s.pctItems }}
            />
          </Card>
          <Card title="Storico pagamenti">
            {payments.length === 0 ? <p className="text-fg-3">Nessun pagamento.</p> : (
              <TableWrap>
                <table className="tbl">
                  <thead><tr><th>Data</th><th className="num">Spettava</th><th className="num">Pagato</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={p.action === "ANNULLATO" ? "opacity-60" : ""}>
                        <td className="text-[13.5px]">{dateTime(p.createdAt)}<div className="text-fg-3">{p.recordedBy?.displayName}{p.notes ? ` · ${p.notes}` : ""}</div></td>
                        <td className="num">{p.action === "ANNULLATO" ? "—" : money(p.dueAmount)}</td>
                        <td className="num font-semibold">{p.action === "ANNULLATO" ? <span className="badge badge-accent">annullato</span> : money(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
