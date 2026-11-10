import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { imageUrl } from "@/lib/catalog";
import { horsePricing, SEX_LABEL } from "@/lib/horses";
import { bracketLabel } from "@/lib/pricing";
import { formatAge } from "@/lib/age";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Panel, Empty, TableWrap } from "@/components/ui";
import clsx from "clsx";
import { StatusBadge } from "@/components/StatusBadge";

export const metadata = { title: "Cavalli in stalla" };

type SP = { q?: string; razza?: string; sesso?: string; vista?: string; vendibili?: string };

export default async function StablePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser("horses.view");
  const sp = await searchParams;
  const s = await getSettings();
  const storico = sp.vista === "storico";
  const where: Prisma.HorseWhereInput = storico ? {} : { status: "IN_STALLA" };
  if (sp.razza) where.breedId = Number(sp.razza);
  if (sp.sesso === "MASCHIO" || sp.sesso === "FEMMINA") where.sex = sp.sesso;
  if (sp.q) {
    where.OR = [
      { plate: { contains: sp.q } },
      { breed: { name: { contains: sp.q } } },
      { coat: { name: { contains: sp.q } } },
      { notes: { contains: sp.q } },
    ];
  }
  const [horses, breeds] = await Promise.all([
    prisma.horse.findMany({
      where,
      include: { breed: true, coat: true, capturedBy: { select: { displayName: true } } },
      orderBy: { capturedAt: "desc" },
      take: storico ? 300 : 500,
    }),
    prisma.breed.findMany({ where: { archived: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const now = new Date();
  let rows = horses.map((h) => ({ h, p: horsePricing(h, s, now) }));
  if (sp.vendibili === "1") rows = rows.filter((r) => r.p.bracket !== "TROPPO_GIOVANE");

  return (
    <>
      <PageHeader
        title={storico ? "Storico catture" : "Cavalli in stalla"}
        subtitle={storico ? "Tutti i cavalli registrati, compresi venduti e usciti." : `${rows.length} cavalli presenti. L'età avanza di 1 anno ogni ${s.daysPerYear} giorni reali.`}
        actions={
          <>
            <Link href={storico ? "/stalla" : "/stalla?vista=storico"} className="btn btn-ghost !bg-paper/80">
              {storico ? "Cavalli in stalla" : "Storico catture"}
            </Link>
            <Link href="/stalla/nuovo" className="btn btn-gold">+ Registra cattura</Link>
          </>
        }
      />
      <Panel className="mb-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_auto_auto]">
          {storico && <input type="hidden" name="vista" value="storico" />}
          <input name="q" defaultValue={sp.q} className="input" placeholder="Cerca targa, razza, manto, note…" />
          <select name="razza" defaultValue={sp.razza ?? ""} className="input">
            <option value="">Tutte le razze</option>
            {breeds.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select name="sesso" defaultValue={sp.sesso ?? ""} className="input">
            <option value="">Entrambi i sessi</option>
            <option value="MASCHIO">Maschi</option>
            <option value="FEMMINA">Femmine</option>
          </select>
          {!storico && (
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input type="checkbox" name="vendibili" value="1" defaultChecked={sp.vendibili === "1"} className="size-4 accent-[#5a3a22]" />
              Solo vendibili
            </label>
          )}
          <button className="btn btn-primary">Filtra</button>
        </form>
      </Panel>

      {rows.length === 0 ? (
        <Panel><Empty>Nessun cavallo trovato.</Empty></Panel>
      ) : storico ? (
        <Panel pad>
          <TableWrap>
            <table className="ledger">
              <thead>
                <tr><th>Data</th><th>Razza / Manto</th><th>Sesso</th><th>Targa</th><th>Catturato da</th><th>Età</th><th>Stato</th></tr>
              </thead>
              <tbody>
                {rows.map(({ h, p }) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap">{dateTime(h.capturedAt)}</td>
                    <td><Link className="underline decoration-dotted" href={`/stalla/${h.id}`}>{h.breed.name}</Link> <span className="italic text-ink-soft">– {h.coat.name}</span></td>
                    <td>{SEX_LABEL[h.sex]}</td>
                    <td className="font-semibold">{h.plate}</td>
                    <td>{h.capturedBy.displayName}</td>
                    <td className="num">{h.status === "IN_STALLA" ? formatAge(p.age) : "—"}</td>
                    <td><StatusBadge status={h.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ h, p }) => (
            <Link key={h.id} href={`/stalla/${h.id}`} className="panel group overflow-hidden rise transition hover:-translate-y-0.5">
              <div className="flex">
                <div className="w-[38%] shrink-0 bg-[#cdb180]/50">
                  {h.coat.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(h.coat.imagePath)!} alt="" className="h-full max-h-[150px] w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full min-h-[120px] items-center justify-center text-4xl text-ink-soft/40">♞</div>
                  )}
                </div>
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="title-fell truncate text-[16px] text-leather">{h.breed.name}</div>
                      <div className="truncate italic">{h.coat.name}</div>
                    </div>
                    <span className="badge badge-ink shrink-0">{h.plate}</span>
                  </div>
                  <div className="mt-2 text-[14.5px] leading-snug">
                    <div>{SEX_LABEL[h.sex]} · <b>{formatAge(p.age)}</b></div>
                    <div className="text-ink-soft">Fascia: {bracketLabel(p.bracket, s)}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={clsx("badge", p.bracket === "TROPPO_GIOVANE" ? "badge-red" : "badge-green")}>
                      {p.bracket === "TROPPO_GIOVANE" ? "Non vendibile" : "Vendibile"}
                    </span>
                    <span className="font-semibold">{p.listPrice != null ? money(p.listPrice) : p.bracket === "LIBERO" ? "Prezzo libero" : "—"}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
