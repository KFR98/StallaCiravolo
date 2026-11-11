import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { payrollOverview } from "@/lib/payroll";
import { money, dateTime, dateOnly, TZ } from "@/lib/format";
import { weekLabel } from "@/lib/weeks";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader, Card, StatTile, TableWrap, Empty } from "@/components/ui";
import { PayButton } from "./PayrollControls";
import { StaffTabs } from "../StaffTabs";

export const metadata = { title: "Stipendi" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const user = await requireUser("payroll.manage");
  const sp = await searchParams;
  const s = await getSettings();
  const storico = sp.vista === "storico";
  const header = (
    <PageHeader
      title="Personale"
      subtitle={`Stipendio settimanale (lunedì–domenica): ${s.pctStable}% vendite in stalla · ${s.pctGov}% vendite al blip · ${s.pctItems}% vendite oggetti, salvo percentuali personali.`}
      actions={<a href="/api/export/pagamenti" className="btn btn-secondary">Esporta</a>}
    />
  );

  if (storico) {
    const payments = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 400, include: { user: true, recordedBy: true } });
    return (
      <>
        {header}
        <StaffTabs role={user.role} active="storico" />
        <Card>
          {payments.length === 0 ? <Empty>Nessun pagamento registrato.</Empty> : (
            <TableWrap>
              <table className="tbl">
                <thead><tr><th>Data</th><th>Dipendente</th><th>Settimana</th><th className="num">Spettava</th><th className="num">Pagato</th><th className="num">Differenza</th><th>Da</th><th>Note</th></tr></thead>
                <tbody>
                  {payments.map((p) => {
                    const annul = p.action === "ANNULLATO";
                    const diff = Number(p.amount) - Number(p.dueAmount);
                    return (
                      <tr key={p.id} className={annul ? "opacity-60" : ""}>
                        <td className="whitespace-nowrap">{dateTime(p.createdAt)}</td>
                        <td className="font-semibold">{p.user.displayName}</td>
                        <td className="whitespace-nowrap">{weekLabel(p.weekStart, TZ)}</td>
                        <td className="num">{annul ? "—" : money(p.dueAmount)}</td>
                        <td className="num font-semibold">{annul ? <span className="badge badge-accent">Annullato {money(p.amount)}</span> : money(p.amount)}</td>
                        <td className="num">{annul || Math.abs(diff) < 0.005 ? "—" : <span className={diff > 0 ? "text-ok" : "text-warn"}>{diff > 0 ? "+" : "−"}{money(Math.abs(diff))}</span>}</td>
                        <td>{p.recordedBy?.displayName ?? "—"}</td>
                        <td className="max-w-[240px] text-[13.5px] text-fg-2">{p.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </>
    );
  }

  const list = await payrollOverview();
  const due = list.reduce((t, u) => t + u.due, 0);
  const paidAll = list.reduce((t, u) => t + u.paidTotal, 0);
  const toPay = list.filter((u) => u.due > 0);
  return (
    <>
      {header}
      <StaffTabs role={user.role} active="stipendi" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Da pagare" value={money(due)} hint="settimane concluse" tone="accent" />
        <StatTile label="Già pagato" value={money(paidAll)} />
        <StatTile label="Dipendenti da pagare" value={toPay.length} />
        <StatTile label="Settimane arretrate" value={list.reduce((t, u) => t + u.arrears.length, 0)} />
      </div>
      <Card pad={false}>
        {list.length === 0 ? <Empty>Nessun dipendente.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th className="!pl-5">Dipendente</th><th>Percentuali</th><th>Ultimo pagamento</th><th>Arretrati</th><th className="num">Gli spetta</th><th className="num">Sett. in corso</th><th className="!pr-5" /></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.userId}>
                    <td className="!pl-5"><Link href={`/stipendi/${u.userId}`} className="font-semibold hover:text-accent-text">{u.name}</Link><div className="text-[12.5px] text-fg-3">{ROLE_LABELS[u.role]}{!u.active ? " · disattivato" : ""}</div></td>
                    <td className="text-[13px] whitespace-nowrap text-fg-2">S {u.percents.stable}% · B {u.percents.gov}% · O {u.percents.items}%{u.percents.custom && <span className="badge badge-info ml-1">personali</span>}</td>
                    <td className="whitespace-nowrap">{u.lastPaidAt ? dateOnly(u.lastPaidAt) : <span className="text-fg-3">mai</span>}</td>
                    <td>{u.arrears.length === 0 ? <span className="badge badge-ok">In regola</span> : <span className="badge badge-warn">{u.arrears.length} {u.arrears.length === 1 ? "settimana" : "settimane"}</span>}</td>
                    <td className="num text-[16px] font-bold">{money(u.due)}</td>
                    <td className="num text-fg-3">{money(u.current?.due ?? 0)}</td>
                    <td className="!pr-5 text-right">
                      <PayButton userId={u.userId} name={u.name} due={u.due} weeks={u.arrears.map((w) => weekLabel(w.weekStart, TZ).split(" – ")[0])} currentDue={u.current?.residual ?? 0} className={u.due > 0 ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-[13px] text-fg-3">“Paga” distribuisce l&apos;importo sulle settimane arretrate dalla più vecchia. Puoi pagare di più (incentivo) o di meno (resta un residuo). Una settimana risulta pagata solo dopo la registrazione.</p>
    </>
  );
}
