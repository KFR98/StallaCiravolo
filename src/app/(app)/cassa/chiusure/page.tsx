import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Card, Empty } from "@/components/ui";

export const metadata = { title: "Chiusure di cassa" };

export default async function ClosuresPage() {
  await requireUser("cash.view");
  const list = await prisma.cashClosure.findMany({ orderBy: { periodTo: "desc" }, take: 200 });
  return (
    <>
      <Link href="/cassa" className="btn btn-ghost btn-sm mb-3 -ml-2"><ArrowLeft size={16} /> Cassa</Link>
      <PageHeader title="Chiusure di cassa" subtitle="Ogni chiusura fotografa entrate, uscite e saldo del periodo, con il contante contato. Non si possono modificare." />
      <Card pad={false}>
        {list.length === 0 ? <div className="card-pad"><Empty>Ancora nessuna chiusura. Si fa dalla pagina Cassa con “Chiudi cassa”.</Empty></div> : (
          <ul className="divide-y divide-border">
            {list.map((c) => {
              const diff = c.difference == null ? null : Number(c.difference);
              return (
                <li key={c.id}>
                  <Link href={`/cassa/chiusure/${c.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">Chiusura del {dateTime(c.periodTo)}</div>
                      <div className="text-[13px] text-fg-3">{c.periodFrom ? `dal ${dateTime(c.periodFrom)}` : "dall'inizio"} · {c.userName}{c.notes ? ` · ${c.notes}` : ""}</div>
                    </div>
                    {diff != null && (
                      <span className={`badge ${Math.abs(diff) < 0.005 ? "badge-ok" : "badge-accent"}`}>
                        {Math.abs(diff) < 0.005 ? "Al centesimo" : diff > 0 ? `+${money(diff)}` : `Ammanco ${money(-diff)}`}
                      </span>
                    )}
                    <b className="tabular-nums">{money(c.expected)}</b>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
