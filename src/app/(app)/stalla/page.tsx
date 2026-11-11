import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { imageUrl, getBreedOptions } from "@/lib/catalog";
import { horsePricing, sexLabel } from "@/lib/horses";
import { formatAge } from "@/lib/age";
import { money, dateTime } from "@/lib/format";
import { PageHeader, Card, Empty, TableWrap, Tabs, HorseName } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { StableBoard, type BoardHorse } from "./StableBoard";
import { CaptureButton } from "./CaptureDialog";

export const metadata = { title: "Stalla" };

export default async function StablePage({ searchParams }: { searchParams: Promise<{ vista?: string; q?: string }> }) {
  const user = await requireUser("horses.view");
  const sp = await searchParams;
  const s = await getSettings();
  const storico = sp.vista === "storico";
  const [inStable, breeds] = await Promise.all([
    prisma.horse.count({ where: { status: "IN_STALLA" } }),
    can(user.role, "horses.capture") ? getBreedOptions() : Promise.resolve([]),
  ]);
  const tabs = (
    <Tabs active={storico ? "storico" : "stalla"} items={[
      { key: "stalla", href: "/stalla", label: "In stalla", count: inStable },
      { key: "storico", href: "/stalla?vista=storico", label: "Storico catture" },
    ]} />
  );
  const header = (
    <PageHeader
      title="Stalla"
      subtitle={`L'età avanza di 1 anno ogni ${s.daysPerYear} giorni reali. Ogni cavallo può essere venduto solo dallo stalliere che lo ha in carico.`}
      actions={can(user.role, "horses.capture") ? <Suspense><CaptureButton breeds={breeds} defaultAge={s.defaultCaptureAge} /></Suspense> : undefined}
    />
  );

  if (storico) {
    const q = sp.q?.trim();
    const horses = await prisma.horse.findMany({
      where: q ? { OR: [{ plate: { contains: q } }, { breed: { name: { contains: q } } }, { coat: { name: { contains: q } } }] } : {},
      include: { breed: true, coat: true, capturedBy: { select: { displayName: true } }, owner: { select: { displayName: true } } },
      orderBy: { capturedAt: "desc" },
      take: 300,
    });
    return (
      <>
        {header}
        {tabs}
        <Card>
          <form className="mb-4 flex gap-2">
            <input type="hidden" name="vista" value="storico" />
            <input name="q" defaultValue={q} className="input" placeholder="Cerca targa, razza o manto…" />
            <button className="btn btn-secondary">Cerca</button>
          </form>
          {horses.length === 0 ? <Empty>Nessun cavallo registrato.</Empty> : (
            <TableWrap>
              <table className="tbl">
                <thead><tr><th>Cavallo</th><th>Targa</th><th>Sesso</th><th>Registrato</th><th>Catturato da</th><th>In carico</th><th>Stato</th></tr></thead>
                <tbody>
                  {horses.map((h) => (
                    <tr key={h.id}>
                      <td><HorseName image={imageUrl(h.coat.imagePath)} breed={h.breed.name} coat={h.coat.name} href={`/stalla/${h.id}`} /></td>
                      <td className="font-mono">{h.plate ?? "—"}</td>
                      <td>{sexLabel(h.sex)}</td>
                      <td className="whitespace-nowrap">{dateTime(h.capturedAt)}</td>
                      <td>{h.capturedBy.displayName}</td>
                      <td>{h.owner.displayName}</td>
                      <td><StatusBadge status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      </>
    );
  }

  const horses = await prisma.horse.findMany({
    where: { status: "IN_STALLA" },
    include: { breed: true, coat: true, capturedBy: { select: { displayName: true } }, owner: { select: { displayName: true } } },
    orderBy: { capturedAt: "desc" },
  });
  const now = new Date();
  const board: BoardHorse[] = horses.map((h) => {
    const p = horsePricing(h, s, now);
    return {
      id: h.id, breed: h.breed.name, coat: h.coat.name, image: imageUrl(h.coat.imagePath), plate: h.plate ?? "—", sex: sexLabel(h.sex),
      ageText: formatAge(p.age), sellable: p.bracket !== "TROPPO_GIOVANE",
      price: p.listPrice != null ? money(p.listPrice) : p.bracket === "LIBERO" ? "Prezzo libero" : "—",
      ownerId: h.ownerId, owner: h.owner.displayName, capturedBy: h.capturedBy.displayName,
      dueAt: h.pregnancyDueAt?.toISOString() ?? null, condition: h.condition, mine: h.ownerId === user.id,
    };
  });
  return (
    <>
      {header}
      {tabs}
      {board.length === 0 ? (
        <Card><Empty>La stalla è vuota. Registra la prima cattura.</Empty></Card>
      ) : (
        <StableBoard horses={board} meId={user.id} />
      )}
      <p className="mt-6 text-[13px] text-fg-3">Cerca un cavallo già venduto? <Link href="/stalla?vista=storico" className="underline">Apri lo storico catture</Link>.</p>
    </>
  );
}
