"use client";

import { useMemo, useState, useEffect } from "react";
import { ActionForm } from "@/components/ActionForm";
import { captureHorse } from "../actions";
import type { BreedOption } from "@/lib/catalog";
import { money } from "@/lib/format";
import clsx from "clsx";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();

export function CaptureForm({ breeds, defaultAge, initialCoatId, minSaleAge }: { breeds: BreedOption[]; defaultAge: number; initialCoatId?: number; minSaleAge: number }) {
  const initialBreed = initialCoatId ? breeds.find((b) => b.coats.some((c) => c.id === initialCoatId)) : undefined;
  const [breedId, setBreedId] = useState<number | "">(initialBreed?.id ?? "");
  const [coatId, setCoatId] = useState<number | "">(initialCoatId ?? "");
  const [sex, setSex] = useState<"MASCHIO" | "FEMMINA" | "">("");
  const [age, setAge] = useState<string>(String(defaultAge));
  const [requestId, setRequestId] = useState("");
  const [filter, setFilter] = useState("");
  useEffect(() => setRequestId(newId()), []);

  const breed = breeds.find((b) => b.id === breedId);
  const coat = breed?.coats.find((c) => c.id === coatId);
  const filteredBreeds = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return breeds;
    return breeds.filter((b) => b.name.toLowerCase().includes(q) || b.coats.some((c) => c.name.toLowerCase().includes(q)));
  }, [breeds, filter]);

  return (
    <ActionForm
      action={captureHorse}
      confirm={(fd) =>
        fd.get("mode") === "GOVERNO"
          ? `Confermi la VENDITA AL GOVERNO di ${breed?.name ?? ""} – ${coat?.name ?? ""} per ${money(coat?.governmentPrice)}?\nIl cavallo non entrerà in stalla.`
          : null
      }
      onSuccess={() => {
        setRequestId(newId());
      }}
      className="grid gap-5 lg:grid-cols-[1fr_360px]"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="panel panel-pad space-y-4 rise">
        <div>
          <span className="label mb-1 block">Cerca razza o manto</span>
          <input className="input" placeholder="Es. arabian, perlino…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1 block">Razza *</span>
            <select
              name="breedId"
              className="input"
              required
              value={breedId}
              onChange={(e) => {
                setBreedId(e.target.value ? Number(e.target.value) : "");
                setCoatId("");
              }}
            >
              <option value="">— Seleziona —</option>
              {filteredBreeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">Manto *</span>
            <select name="coatId" className="input" required value={coatId} disabled={!breed} onChange={(e) => setCoatId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">{breed ? "— Seleziona —" : "Prima scegli la razza"}</option>
              {breed?.coats
                .filter((c) => !filter || breed.name.toLowerCase().includes(filter.toLowerCase()) || c.name.toLowerCase().includes(filter.toLowerCase()))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="label mb-1 block">Età iniziale (anni) *</span>
            <input name="age" type="number" step="0.25" min="0" max="60" className="input" required value={age} onChange={(e) => setAge(e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <span className="label mb-1 block">Sesso *</span>
            <input type="hidden" name="sex" value={sex} />
            <div className="grid grid-cols-2 gap-2">
              {(["MASCHIO", "FEMMINA"] as const).map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setSex(s)}
                  className={clsx("btn", sex === s ? "btn-primary" : "btn-ghost")}
                >
                  {s === "MASCHIO" ? "♂ Maschio" : "♀ Femmina"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="block">
          <span className="label mb-1 block">Targa del server *</span>
          <input name="plate" className="input uppercase" required maxLength={40} placeholder="Es. AB123" autoComplete="off" />
        </label>
        <label className="block">
          <span className="label mb-1 block">Note</span>
          <textarea name="notes" className="input min-h-[80px]" maxLength={2000} placeholder="Facoltative" />
        </label>
      </div>

      <div className="space-y-4">
        <div className="panel overflow-hidden rise">
          <div className="aspect-[4/3] w-full bg-[#cdb180]/50">
            {coat?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coat.image} alt={coat.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center title-fell text-ink-soft/70">{coat ? "Immagine non disponibile" : "Seleziona un manto"}</div>
            )}
          </div>
          <div className="panel-pad space-y-1.5">
            <div className="title-fell text-[18px] text-leather">{breed?.name ?? "—"}</div>
            <div className="italic">{coat?.name ?? ""}</div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[15px]">
              <span className="text-ink-soft">Vendita {minSaleAge}-10</span>
              <span className="text-right font-semibold">{money(coat?.salePriceA)}</span>
              <span className="text-ink-soft">Vendita 11-16</span>
              <span className="text-right font-semibold">{money(coat?.salePriceB)}</span>
              <span className="text-ink-soft">Governo (blip)</span>
              <span className="text-right font-semibold text-blood">{money(coat?.governmentPrice)}</span>
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          <button name="mode" value="DEPOSITA" className="btn btn-primary py-3 text-[17px]" disabled={!requestId}>
            Deposita in stalla
          </button>
          <button name="mode" value="GOVERNO" className="btn btn-danger py-3 text-[17px]" disabled={!requestId || !coat || coat.governmentPrice == null}>
            Vendi al Governo {coat ? `· ${money(coat.governmentPrice)}` : ""}
          </button>
        </div>
      </div>
    </ActionForm>
  );
}
