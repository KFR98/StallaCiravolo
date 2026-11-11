import Link from "next/link";
import { fromZonedTime } from "date-fns-tz";
import { userHistory, userTotals, HISTORY_TYPES, type HistoryType } from "@/lib/history";
import { money, dateTime, dateOnly, TZ } from "@/lib/format";
import { Card, Empty, HorseThumb, StatTile } from "./ui";
import clsx from "clsx";

export type HistorySearch = { tipo?: string; da?: string; a?: string };

const TYPE_BADGE: Record<HistoryType, string> = {
  CATTURA: "badge-neutral", VENDITA: "badge-accent", BLIP: "badge-info", OGGETTI: "badge-neutral", PAGAMENTO: "badge-ok", PASSAGGIO: "badge-warn", RIMBORSO: "badge-ok",
};

/** Card con i totali da quando lo stalliere è stato assunto. */
export async function UserTotalsCards({ userId }: { userId: number }) {
  const t = await userTotals(userId);
  return (
    <div className="mb-5">
      <div className="mb-2 text-[13.5px] text-fg-3">In servizio dal <b className="text-fg">{dateOnly(t.since)}</b> · {t.days} {t.days === 1 ? "giorno" : "giorni"}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Catture" value={t.captures} hint={`${t.deposits} depositati in stalla`} />
        <StatTile label="Vendite in stalla" value={t.stableSales} hint={money(t.stableRevenue)} />
        <StatTile label="Vendite al blip" value={t.govSales} hint={money(t.govRevenue)} />
        <StatTile label="Vendite oggetti" value={t.itemSales} hint={money(t.itemsRevenue)} />
        <StatTile label="Incasso generato" value={money(t.revenue)} tone="accent" />
        <StatTile label="Stipendi ricevuti" value={money(t.salaryPaid)} hint={t.reimbursed ? `+ ${money(t.reimbursed)} di rimborsi` : undefined} />
      </div>
    </div>
  );
}

/** Storico filtrabile per tipo e periodo. */
export async function UserHistoryList({ userId, sp, basePath }: { userId: number; sp: HistorySearch; basePath: string }) {
  const types = (sp.tipo ?? "").split(",").filter((t): t is HistoryType => t in HISTORY_TYPES);
  const from = sp.da && /^\d{4}-\d{2}-\d{2}$/.test(sp.da) ? fromZonedTime(sp.da + "T00:00:00", TZ) : undefined;
  const to = sp.a && /^\d{4}-\d{2}-\d{2}$/.test(sp.a) ? fromZonedTime(sp.a + "T23:59:59", TZ) : undefined;
  const events = await userHistory(userId, { types, from, to, limit: 400 });
  const href = (t: string) => {
    const p = new URLSearchParams();
    if (t) p.set("tipo", t);
    if (sp.da) p.set("da", sp.da);
    if (sp.a) p.set("a", sp.a);
    return `${basePath}?${p}`;
  };
  const sum = (sign: "+" | "=") => events.filter((e) => e.sign === sign && !e.muted).reduce((t, e) => t + (e.amount ?? 0), 0);

  return (
    <Card title="Storico" actions={<span className="text-[13px] text-fg-3">{events.length} movimenti</span>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href("")} className="chip" aria-pressed={types.length === 0}>Tutto</Link>
        {(Object.keys(HISTORY_TYPES) as HistoryType[]).map((t) => (
          <Link key={t} href={href(t)} className="chip" aria-pressed={types.length === 1 && types[0] === t}>{HISTORY_TYPES[t]}</Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2" action={basePath}>
        {sp.tipo && <input type="hidden" name="tipo" value={sp.tipo} />}
        <label className="block"><span className="field-label">Dal</span><input type="date" name="da" defaultValue={sp.da} className="input" /></label>
        <label className="block"><span className="field-label">Al</span><input type="date" name="a" defaultValue={sp.a} className="input" /></label>
        <button className="btn btn-secondary">Applica</button>
        {(sp.da || sp.a) && <Link href={href(sp.tipo ?? "")} className="btn btn-ghost">Tutto il periodo</Link>}
        <div className="ml-auto text-right text-[13.5px] text-fg-2">
          Incassi per la stalla: <b className="text-fg">{money(sum("="))}</b><br />Ricevuti dallo stalliere: <b className="text-fg">{money(sum("+"))}</b>
        </div>
      </form>
      {events.length === 0 ? <Empty>Nessun movimento in questo periodo.</Empty> : (
        <ul className="divide-y divide-border">
          {events.map((e) => {
            const body = (
              <div className={clsx("flex items-center gap-3 py-2.5", e.muted && "opacity-55")}>
                {e.image !== undefined ? <HorseThumb src={e.image} size={34} /> : <span className="w-[42px]" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${TYPE_BADGE[e.type]}`}>{HISTORY_TYPES[e.type]}</span>
                    <span className="truncate font-medium">{e.title}</span>
                  </div>
                  <div className="truncate text-[13px] text-fg-3">{dateTime(e.date)}{e.detail ? ` · ${e.detail}` : ""}</div>
                </div>
                {e.amount != null && (
                  <b className={clsx("tabular-nums whitespace-nowrap", e.sign === "+" && "text-ok", e.sign === "-" && "text-accent-text")}>
                    {e.sign === "+" ? "+" : e.sign === "-" ? "−" : ""}{money(e.amount)}
                  </b>
                )}
              </div>
            );
            return <li key={e.key}>{e.href ? <Link href={e.href} className="block hover:bg-surface-2">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </Card>
  );
}
