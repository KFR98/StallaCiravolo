import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money, dateTime } from "@/lib/format";
import type { ClosureSummary } from "@/lib/cash-closure";
import { Card } from "@/components/ui";
import { PrintButton } from "../../ClosureClient";

export const metadata = { title: "Chiusura di cassa" };

/** Riepilogo stampabile di una chiusura. */
export default async function ClosurePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("cash.view");
  const c = await prisma.cashClosure.findUnique({ where: { id: Number((await params).id) || 0 } });
  if (!c) notFound();
  const s = await getSettings();
  let sum: ClosureSummary | null = null;
  try { sum = JSON.parse(c.summary); } catch { sum = null; }
  const diff = c.difference == null ? null : Number(c.difference);
  const signed = (v: number) => `${v < 0 ? "−" : "+"}${money(Math.abs(v))}`;
  return (
    <>
      <div className="no-print mb-3 flex items-center justify-between gap-2">
        <Link href="/cassa/chiusure" className="btn btn-ghost btn-sm -ml-2"><ArrowLeft size={16} /> Chiusure</Link>
        <PrintButton />
      </div>
      <article className="print-sheet space-y-5">
        <header>
          <div className="eyebrow">{s.stableName}</div>
          <h1 className="h-display text-[30px]">Chiusura di cassa</h1>
          <p className="text-fg-2">{c.periodFrom ? `Dal ${dateTime(c.periodFrom)}` : "Dall'inizio"} al {dateTime(c.periodTo)} · registrata da {c.userName}</p>
          {c.notes && <p className="mt-1 text-fg-2">{c.notes}</p>}
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Box label="Saldo iniziale" value={money(sum?.openingBalance ?? 0)} />
          <Box label="Entrate" value={`+${money(sum?.income ?? 0)}`} tone="ok" />
          <Box label="Uscite" value={`−${money(Math.abs(sum?.outgo ?? 0))}`} tone="out" />
          <Box label="Saldo calcolato" value={money(c.expected)} strong />
        </div>
        {c.counted != null && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Contante contato: <b className="tabular-nums">{money(c.counted)}</b></span>
              <span className={`badge ${diff != null && Math.abs(diff) < 0.005 ? "badge-ok" : "badge-accent"}`}>
                {diff == null || Math.abs(diff) < 0.005 ? "Torna al centesimo" : diff > 0 ? `Eccedenza ${money(diff)}` : `Ammanco ${money(-diff)}`}
              </span>
            </div>
          </Card>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Per tipo" pad={false}>
            <table className="tbl">
              <tbody>
                {(sum?.byKind ?? []).map((k) => (
                  <tr key={k.kind}><td className="!pl-5">{k.label} <span className="text-fg-3">({k.count})</span></td><td className={`num !pr-5 font-semibold ${k.total < 0 ? "text-accent-text" : "text-ok"}`}>{signed(k.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Vendite per stalliere" pad={false}>
            <table className="tbl">
              <tbody>
                {(sum?.bySeller ?? []).length === 0 ? <tr><td className="!pl-5 text-fg-3">Nessuna vendita nel periodo.</td></tr> : sum!.bySeller.map((x) => (
                  <tr key={x.name}><td className="!pl-5">{x.name} <span className="text-fg-3">({x.count})</span></td><td className="num !pr-5 font-semibold">{money(x.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </article>
    </>
  );
}

function Box({ label, value, tone, strong }: { label: string; value: string; tone?: "ok" | "out"; strong?: boolean }) {
  return (
    <div className="card p-3.5">
      <div className="text-[12.5px] font-semibold tracking-wide text-fg-3 uppercase">{label}</div>
      <div className={`mt-1 font-bold tabular-nums ${strong ? "text-[24px]" : "text-[20px]"} ${tone === "ok" ? "text-ok" : tone === "out" ? "text-accent-text" : ""}`}>{value}</div>
    </div>
  );
}
