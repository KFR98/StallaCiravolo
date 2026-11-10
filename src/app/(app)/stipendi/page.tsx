import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { payrollOverview } from "@/lib/payroll";
import { money, dateTime, dateOnly, TZ } from "@/lib/format";
import { weekLabel, weekStartOf, isoWeekKey, parseWeekKey, addWeeks } from "@/lib/weeks";
import { ROLE_LABELS } from "@/lib/permissions";
import { PageHeader, Panel, StatTile, TableWrap, Empty } from "@/components/ui";
import { WeekActions, PayArrearsButton } from "./PayrollControls";
import clsx from "clsx";

export const metadata = { title: "Stipendi" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ settimana?: string; vista?: string }> }) {
  await requireUser("payroll.manage");
  const sp = await searchParams;
  const s = await getSettings();
  const list = await payrollOverview();
  const current = weekStartOf(new Date(), TZ);
  const selected = (sp.settimana && parseWeekKey(sp.settimana, TZ)) || addWeeks(current, -1, TZ);
  const selKey = isoWeekKey(selected, TZ);
  const due = list.reduce((t, u) => t + u.due, 0);
  const paidAll = list.reduce((t, u) => t + u.paidTotal, 0);
  const toPay = list.filter((u) => u.arrears.length > 0);
  const arrearsWeeks = list.reduce((t, u) => t + u.arrears.length, 0);
  const vista = sp.vista === "storico" ? "storico" : "registro";
  const payments = vista === "storico"
    ? await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { user: true, recordedBy: true } })
    : [];

  return (
    <>
      <PageHeader
        title="Registro stipendi"
        subtitle={`Stipendio = ${s.salaryPercent}% del lordo vendite${s.salaryIncludeGov && s.salaryIncludeStable ? " (stalla + Governo)" : s.salaryIncludeGov ? " (solo Governo)" : " (solo stalla)"}, salvo percentuali personali. Settimane da lunedì a domenica.`}
        actions={
          <>
            <Link href={vista === "storico" ? "/stipendi" : "/stipendi?vista=storico"} className="btn btn-ghost !bg-paper/80">{vista === "storico" ? "Registro settimanale" : "Storico pagamenti"}</Link>
            <a href="/api/export/pagamenti" className="btn btn-ghost !bg-paper/80">Esporta</a>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Totale da pagare" value={money(due)} hint="settimane concluse" />
        <StatTile label="Totale già pagato" value={money(paidAll)} />
        <StatTile label="Dipendenti da pagare" value={toPay.length} />
        <StatTile label="Settimane arretrate" value={arrearsWeeks} />
      </div>

      {vista === "storico" ? (
        <Panel title="Storico pagamenti">
          {payments.length === 0 ? <Empty>Nessun pagamento registrato.</Empty> : (
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Registrato il</th><th>Dipendente</th><th>Settimana</th><th className="num">Importo</th><th>Stato</th><th>Registrato da</th><th>Note</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{dateTime(p.createdAt)}</td>
                      <td>{p.user.displayName}</td>
                      <td className="whitespace-nowrap">{weekLabel(p.weekStart, TZ)}</td>
                      <td className="num font-semibold">{money(p.amount)}</td>
                      <td><span className={clsx("badge", p.action === "PAGATO" ? "badge-green" : "badge-red")}>{p.action === "PAGATO" ? "Pagato" : "Annullato"}</span></td>
                      <td>{p.recordedBy?.displayName ?? "—"}</td>
                      <td className="max-w-[260px] text-[14px]">{p.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>
      ) : (
        <>
          <Panel title="Chi deve essere pagato" className="mb-5">
            {list.length === 0 ? <Empty>Nessun dipendente.</Empty> : (
              <TableWrap>
                <table className="ledger">
                  <thead>
                    <tr><th>Dipendente</th><th className="num">%</th><th>Ultimo pagamento</th><th>Pagato fino a</th><th>Settimane da pagare</th><th className="num">Da pagare</th><th className="num">Sett. in corso</th><th /></tr>
                  </thead>
                  <tbody>
                    {list.map((u) => (
                      <tr key={u.userId}>
                        <td><Link href={`/stipendi/${u.userId}`} className="font-semibold underline decoration-dotted">{u.name}</Link><div className="text-[13px] text-ink-soft">{ROLE_LABELS[u.role]}{!u.active ? " · disattivato" : ""}</div></td>
                        <td className="num">{u.percent}%{u.customPercent ? "*" : ""}</td>
                        <td className="whitespace-nowrap">{u.lastPaidAt ? dateOnly(u.lastPaidAt) : <span className="text-ink-soft italic">mai</span>}</td>
                        <td className="whitespace-nowrap">{u.lastPaidWeek ? weekLabel(u.lastPaidWeek, TZ) : "—"}</td>
                        <td className="text-[14px]">
                          {u.arrears.length === 0 ? <span className="badge badge-green">In regola</span> : (
                            <div className="flex flex-wrap gap-1">{u.arrears.slice(0, 4).map((w) => <span key={w.key} className="badge badge-red">{weekLabel(w.weekStart, TZ).split(" – ")[0]}</span>)}{u.arrears.length > 4 && <span className="badge badge-red">+{u.arrears.length - 4}</span>}</div>
                          )}
                        </td>
                        <td className="num font-bold">{money(u.due)}</td>
                        <td className="num text-ink-soft">{money(u.current?.amount ?? 0)}</td>
                        <td className="text-right"><PayArrearsButton userId={u.userId} name={u.name} count={u.arrears.length} total={u.due} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <p className="mt-2 text-[13px] text-ink-soft italic">* percentuale personale. Una settimana risulta pagata solo dopo la registrazione del pagamento.</p>
          </Panel>

          <Panel
            title={`Settimana ${weekLabel(selected, TZ)}${selKey === isoWeekKey(current, TZ) ? " (in corso)" : ""}`}
            actions={
              <form className="flex items-center gap-2">
                <Link className="btn btn-ghost btn-sm" href={`/stipendi?settimana=${isoWeekKey(addWeeks(selected, -1, TZ), TZ)}`}>←</Link>
                <input type="date" name="settimana" defaultValue={selKey} className="input !w-40 !py-1" />
                <button className="btn btn-primary btn-sm">Vai</button>
                <Link className="btn btn-ghost btn-sm" href={`/stipendi?settimana=${isoWeekKey(addWeeks(selected, 1, TZ), TZ)}`}>→</Link>
              </form>
            }
          >
            {!list.some((u) => u.weeks.some((x) => x.key === selKey)) ? <Empty>Nessun dipendente registrato in questa settimana.</Empty> : (
            <TableWrap>
              <table className="ledger">
                <thead><tr><th>Dipendente</th><th className="num">Vendite</th><th className="num">Totale vendite</th><th className="num">Stipendio</th><th>Stato</th><th>Pagato il</th><th>Note</th><th /></tr></thead>
                <tbody>
                  {list.map((u) => {
                    const w = u.weeks.find((x) => x.key === selKey);
                    if (!w) return null;
                    return (
                      <tr key={u.userId}>
                        <td className="font-semibold">{u.name}</td>
                        <td className="num">{w.salesCount}</td>
                        <td className="num">{money(w.salesTotal)}</td>
                        <td className="num font-bold">{money(w.amount)}{w.overridden && <span title="Importo modificato" className="text-blood">*</span>}</td>
                        <td><span className={clsx("badge", w.status === "PAGATO" ? "badge-green" : w.amount > 0 ? "badge-red" : "badge-ink")}>{w.status === "PAGATO" ? "Pagato" : w.amount > 0 ? "Da pagare" : "Nulla da pagare"}</span></td>
                        <td className="whitespace-nowrap text-[14px]">{w.paidAt ? `${dateOnly(w.paidAt)} · ${w.paidBy ?? ""}` : "—"}</td>
                        <td className="max-w-[200px] text-[14px]">{w.notes}</td>
                        <td><WeekActions userId={u.userId} name={u.name} week={w.key} label={weekLabel(w.weekStart, TZ)} amount={w.amount} computed={w.computed} status={w.status} entryId={w.entryId} notes={w.notes} overridden={w.overridden} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
