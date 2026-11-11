"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { Search, Users, LayoutGrid } from "lucide-react";
import { HorseThumb, Empty } from "@/components/ui";
import { PregnancyBadge } from "@/components/StatusBadge";
import { matchHorse } from "@/components/HorsePicker";

export type BoardHorse = {
  id: number; breed: string; coat: string; image: string | null; plate: string; sex: string; ageText: string; sellable: boolean;
  price: string; ownerId: number; owner: string; capturedBy: string; dueAt: string | null; condition: string | null; mine: boolean;
};

export function StableBoard({ horses, meId }: { horses: BoardHorse[]; meId: number }) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState<number | "tutti" | "miei">("tutti");
  const [group, setGroup] = useState(true);
  const [onlySellable, setOnlySellable] = useState(false);

  const owners = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number }>();
    for (const h of horses) {
      const o = m.get(h.ownerId) ?? { id: h.ownerId, name: h.owner, n: 0 };
      o.n++;
      m.set(h.ownerId, o);
    }
    return [...m.values()].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));
  }, [horses, meId]);

  const list = useMemo(
    () =>
      horses.filter(
        (h) =>
          (owner === "tutti" || (owner === "miei" ? h.ownerId === meId : h.ownerId === owner)) &&
          (!onlySellable || h.sellable) &&
          (matchHorse(h, q) || h.plate.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [horses, owner, onlySellable, q, meId],
  );

  const groups = group
    ? owners.map((o) => ({ key: o.id, title: o.id === meId ? `I miei cavalli` : o.name, items: list.filter((h) => h.ownerId === o.id) })).filter((g) => g.items.length)
    : [{ key: 0, title: "", items: list }];

  return (
    <>
      <div className="card mb-5 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input !pl-9" placeholder="Cerca razza, manto o targa…" aria-label="Cerca" />
        </div>
        <select className="input !w-auto" value={String(owner)} onChange={(e) => setOwner(e.target.value === "tutti" || e.target.value === "miei" ? e.target.value : Number(e.target.value))} aria-label="Stalliere">
          <option value="tutti">Tutti gli stallieri</option>
          <option value="miei">Solo i miei</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.n})</option>)}
        </select>
        <button type="button" className="chip" aria-pressed={onlySellable} onClick={() => setOnlySellable((v) => !v)}>Solo vendibili</button>
        <button type="button" className="chip" aria-pressed={group} onClick={() => setGroup((v) => !v)} title="Raggruppa per stalliere">
          {group ? <Users size={15} /> : <LayoutGrid size={15} />} Per stalliere
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card"><Empty>Nessun cavallo corrisponde ai filtri.</Empty></div>
      ) : (
        <div className="space-y-7">
          {groups.map((g) => (
            <section key={g.key}>
              {g.title && (
                <h2 className="mb-3 flex items-baseline gap-2">
                  <span className="h-display text-[20px]">{g.title}</span>
                  <span className="text-[13px] text-fg-3">{g.items.length} cavalli</span>
                </h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((h) => <HorseCard key={h.id} h={h} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function HorseCard({ h }: { h: BoardHorse }) {
  return (
    <Link href={`/stalla/${h.id}`} className={clsx("card flex gap-3 p-3 transition-colors hover:border-border-strong", h.mine && "ring-1 ring-accent/30")}>
      <HorseThumb src={h.image} size={72} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">{h.breed}</div>
            <div className="truncate text-[13.5px] text-fg-3">{h.coat}</div>
          </div>
          <span className="badge badge-neutral font-mono">{h.plate}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-fg-2">{h.sex} · {h.ageText}</span>
          <PregnancyBadge dueAt={h.dueAt} />
          {!h.sellable && <span className="badge badge-neutral">Troppo giovane</span>}
        </div>
        <div className="mt-2 flex items-end justify-between gap-2 border-t border-border pt-2 text-[12.5px]">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-fg-2">In carico: <b className="text-fg">{h.owner}</b></div>
            <div className="truncate text-fg-3">Catturato da {h.capturedBy}</div>
          </div>
          <b className="text-[15px] whitespace-nowrap">{h.price}</b>
        </div>
      </div>
    </Link>
  );
}

