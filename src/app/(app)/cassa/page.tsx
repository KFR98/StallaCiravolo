import Link from "next/link";
import { fromZonedTime } from "date-fns-tz";
import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, dateTime, TZ } from "@/lib/format";
import { round2 } from "@/lib/pricing";
import { cashLedger, CASH_KIND_LABEL, type CashKind } from "@/lib/cash";
import { getSettings } from "@/lib/settings";
import { PageHeader, Card, Empty } from "@/components/ui";
import { CashActions, VoidMove } from "./CashClient";
import { CloseCashButton } from "./ClosureClient";
import { closureSummary } from "@/lib/cash-closure";

export const metadata = { title: "Cassa" };

type SP = { periodo?: string; da?: string; a?: string; tipo?: string; q?: string; pagina?: string };
const PAGE = 150;
const PERIODS = [["", "Sempre"], ["1", "Oggi"], ["7", "Ultimi 7 giorni"], ["30", "Ultimi 30 giorni"]] as const;
const GROUPS: { key: string; label: string; kinds: CashKind[] }[] = [
  { key: "vendite", label: "Vendite", kinds: ["VENDITA", "BOTTEGA", "BLIP"] },
  { key: "stipendi", label: "Stipendi", kinds: ["STIPENDIO"] },
  { key: "rimborsi", label: "Rimborsi", kinds: ["RIMBORSO"] },
  { key: "manuali", label: "Prelievi e versamenti", kinds: ["PRELIEVO", "VERSAMENTO", "RETTIFICA"] },
];

export default async function CashPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireUser("cash.view");
  const manage = can(me.role, "cash.manage");
  const canClose = can(me.role, "cash.close");
  const preview = canClose ? await closureSummary() : null;
  const sp = await searchParams;
  const s = await getSettings();
  const ledger = await cashLedger();
  const balance = ledger.length ? ledger[ledger.length - 1].balanceAfter : 0;

  // periodo
  let from: Date | null = null;
  let to: Date | null = null;
  const days = Number(sp.periodo);
  if (days === 1) from = fromZonedTime(new Date().toLocaleDateString("sv-SE", { timeZone: TZ }) + "T00:00:00", TZ);
  else if ([7, 30].includes(days)) from = new Date(Date.now() - days * 86400_000);
  if (sp.da && /^\d{4}-\d{2}-\d{2}$/.test(sp.da)) from = fromZonedTime(sp.da + "T00:00:00", TZ);
  if (sp.a && /^\d{4}-\d{2}-\d{2}$/.test(sp.a)) to = fromZonedTime(sp.a + "T23:59:59", TZ);
  const group = GROUPS.find((g) => g.key === sp.tipo);
  const q = sp.q?.trim().toLowerCase().slice(0, 100);
  const inRange = ledger.filter((e) => (!from || e.at >= from) && (!to || e.at <= to));
  const shown = inRange.filter((e) => (!group || group.kinds.includes(e.kind)) && (!q || `${e.text} ${e.who ?? ""}`.toLowerCase().includes(q))).reverse();

  const sum = (kinds: CashKind[], sign: 1 | -1 | 0 = 0) =>
    round2(inRange.filter((e) => !e.voided && kinds.includes(e.kind) && (sign === 0 || Math.sign(e.amount) === sign)).reduce((t, e) => t + e.amount, 0));
  const income = round2(inRange.filter((e) => !e.voided && e.amount > 0).reduce((t, e) => t + e.amount, 0));
  const outgo = round2(inRange.filter((e) => !e.voided && e.amount < 0).reduce((t, e) => t + e.amount, 0));
  const page = Math.max(1, Number(sp.pagina) || 1);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, pagina: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/cassa${p.toString() ? `?${p}` : ""}`;
  };
  const filtered = Object.entries(sp).some(([k, v]) => v && k !== "pagina");

  return (
    <>
      <PageHeader
        title="Cassa"
        subtitle="Quanto c'è in cassa, da dove arriva e dove va. Si aggiorna da solo con vendite, stipendi e rimborsi."
        actions={<>
          <Link href="/cassa/chiusure" className="btn btn-ghost">Chiusure</Link>
          {canClose && <CloseCashButton canAlign={manage} preview={{ from: preview!.from, income: preview!.income, outgo: preview!.outgo, closing: preview!.closingBalance, movements: preview!.movements }} />}
        </>}
      />

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_2fr]">
        <section className="card relative overflow-hidden p-5">
          <div className="eyebrow">In cassa adesso</div>
          <div className={clsx("mt-1 text-[44px] leading-none font-bold tabular-nums", balance < 0 && "text-accent-text")}>{money(balance)}</div>
          <p className="mt-3 text-[13px] text-fg-3">
            Conta: vendite in stalla e in bottega{s.cashCountGov ? ", vendite al blip" : ""}
            {s.cashCountPayroll ? "; toglie gli stipendi pagati" : ""}{s.cashCountReimbursements ? " e i rimborsi pagati" : ""}. Si cambia in Impostazioni.
          </p>
          {manage && <CashActions balance={balance} />}
        </section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Entrate" value={income} tone="in" hint={PERIODS.find(([k]) => k === (sp.periodo ?? ""))?.[1] ?? "Periodo scelto"} />
          <Tile label="Uscite" value={outgo} tone="out" />
          <Tile label="Differenza" value={round2(income + outgo)} tone={income + outgo >= 0 ? "in" : "out"} />
          <Tile label="Vendite" value={sum(["VENDITA", "BOTTEGA", "BLIP"])} href={qs({ tipo: "vendite" })} />
          <Tile label="Stipendi" value={sum(["STIPENDIO"])} href={qs({ tipo: "stipendi" })} />
          <Tile label="Prelievi" value={sum(["PRELIEVO"])} href={qs({ tipo: "manuali" })} />
        </div>
      </div>

      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto]">
        <select name="periodo" defaultValue={sp.periodo ?? ""} className="input" aria-label="Periodo">
          {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input type="date" name="da" defaultValue={sp.da} className="input" aria-label="Dal" title="Dal" />
        <input type="date" name="a" defaultValue={sp.a} className="input" aria-label="Al" title="Al" />
        <select name="tipo" defaultValue={sp.tipo ?? ""} className="input" aria-label="Tipo">
          <option value="">Tutti i movimenti</option>
          {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <input name="q" defaultValue={sp.q} className="input" placeholder="Cerca testo o persona…" aria-label="Cerca" />
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1">Filtra</button>
          {filtered && <Link href="/cassa" className="btn btn-ghost">Azzera</Link>}
        </div>
      </form>

      <Card pad={false}>
        {shown.length === 0 ? <div className="card-pad"><Empty>Nessun movimento.</Empty></div> : (
          <>
            <div className="border-b border-border px-4 py-2.5 text-[13.5px] text-fg-3 sm:px-5">{shown.length} movimenti, dal più recente</div>
            <ul className="divide-y divide-border">
              {shown.slice((page - 1) * PAGE, page * PAGE).map((e) => (
                <li key={e.key} className={clsx("flex items-center gap-3 px-4 py-2.5 sm:px-5", e.voided && "opacity-55")}>
                  <span className={clsx("cash-kind", e.amount >= 0 ? "cash-in" : "cash-out")}>{CASH_KIND_LABEL[e.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className={clsx("truncate text-[14.5px]", e.voided && "line-through")}>{e.text}</div>
                    <div className="text-[12.5px] text-fg-3">
                      {dateTime(e.at)}{e.who ? ` · ${e.who}` : ""}
                      {e.voided && e.voidReason ? ` · annullato: ${e.voidReason}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={clsx("font-bold tabular-nums", e.amount >= 0 ? "text-ok" : "text-accent-text")}>{e.amount >= 0 ? "+" : "−"}{money(Math.abs(e.amount))}</div>
                    {!e.voided && <div className="text-[12px] text-fg-3 tabular-nums" title="Saldo dopo questo movimento">saldo {money(e.balanceAfter)}</div>}
                  </div>
                  {manage && e.movementId && !e.voided && <VoidMove id={e.movementId} label={`${CASH_KIND_LABEL[e.kind]} di ${money(Math.abs(e.amount))}`} />}
                </li>
              ))}
            </ul>
            {shown.length > PAGE && (
              <div className="flex items-center justify-between border-t border-border px-5 py-3">
                <span className="text-fg-3">Pagina {page} di {Math.ceil(shown.length / PAGE)}</span>
                <div className="flex gap-2">
                  {page > 1 && <Link className="btn btn-secondary btn-sm" href={`${qs({})}${filtered ? "&" : "?"}pagina=${page - 1}`}>← Più recenti</Link>}
                  {page * PAGE < shown.length && <Link className="btn btn-secondary btn-sm" href={`${qs({})}${filtered ? "&" : "?"}pagina=${page + 1}`}>Più vecchi →</Link>}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function Tile({ label, value, tone, hint, href }: { label: string; value: number; tone?: "in" | "out"; hint?: string; href?: string }) {
  const body = (
    <>
      <div className="text-[12.5px] font-semibold tracking-wide text-fg-3 uppercase">{label}</div>
      <div className={clsx("mt-1 text-[22px] font-bold tabular-nums", tone === "in" && "text-ok", tone === "out" && "text-accent-text")}>
        {value < 0 ? "−" : ""}{money(Math.abs(value))}
      </div>
      {hint && <div className="text-[12px] text-fg-3">{hint}</div>}
    </>
  );
  return href ? <Link href={href} className="card block p-3.5 transition-colors hover:border-border-strong">{body}</Link> : <div className="card p-3.5">{body}</div>;
}
