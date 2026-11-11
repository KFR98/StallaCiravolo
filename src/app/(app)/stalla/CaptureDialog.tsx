"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ActionForm } from "@/components/ActionForm";
import { HorsePicker, buildHorseOptions, type HorseOption } from "@/components/HorsePicker";
import { HorseThumb } from "@/components/ui";
import type { BreedOption } from "@/lib/catalog";
import { money } from "@/lib/format";
import { captureHorse } from "./actions";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

export function CaptureButton({ breeds, defaultAge, className = "btn btn-primary" }: { breeds: BreedOption[]; defaultAge: number; className?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get("registra") === "1") setOpen(true);
  }, [params]);
  const close = () => {
    setOpen(false);
    if (params.get("registra")) router.replace(path);
  };
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}><Plus size={18} /> Registra cattura</button>
      <Modal open={open} onClose={close} title="Registra cattura">
        <CaptureForm breeds={breeds} defaultAge={defaultAge} onDone={close} />
      </Modal>
    </>
  );
}

function CaptureForm({ breeds, defaultAge, onDone }: { breeds: BreedOption[]; defaultAge: number; onDone: () => void }) {
  const options = useMemo(() => buildHorseOptions(breeds), [breeds]);
  const prices = useMemo(() => new Map(breeds.flatMap((b) => b.coats.map((c) => [c.id, c] as const))), [breeds]);
  const [mode, setMode] = useState<"DEPOSITA" | "GOVERNO">("DEPOSITA");
  const [sel, setSel] = useState<HorseOption | null>(null);
  const [sex, setSex] = useState<"" | "MASCHIO" | "FEMMINA">("");
  const [requestId, setRequestId] = useState("");
  useEffect(() => setRequestId(newId()), []);
  const coat = sel?.coatId ? prices.get(sel.coatId) : undefined;

  return (
    <ActionForm
      action={captureHorse}
      confirm={() => (mode === "GOVERNO" ? `Vendere ${sel?.breed} · ${sel?.coat} al blip per ${money(coat?.governmentPrice)}?` : null)}
      onSuccess={() => {
        setRequestId(newId());
        onDone();
      }}
      className="space-y-4"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="mode" value={mode} />
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-3 p-1" role="radiogroup" aria-label="Destinazione">
        {([["DEPOSITA", "Deposita in stalla"], ["GOVERNO", "Vendi al blip"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
            className={clsx("min-h-10 rounded-md text-[14.5px] font-semibold transition-colors", mode === k ? "bg-surface text-fg shadow-sm" : "text-fg-3 hover:text-fg")}>
            {l}
          </button>
        ))}
      </div>

      <HorsePicker label="Razza e manto *" options={options} onChange={setSel} autoFocus required placeholder="Scrivi per cercare, es. arabo bianco…" />

      {sel && coat && (
        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-[14px]">
          <HorseThumb src={coat.image} size={44} />
          <div className="grid flex-1 grid-cols-3 gap-2">
            <div><div className="text-fg-3">5-10 anni</div><b>{money(coat.salePriceA)}</b></div>
            <div><div className="text-fg-3">11-16 anni</div><b>{money(coat.salePriceB)}</b></div>
            <div><div className="text-fg-3">Blip</div><b className="text-accent-text">{money(coat.governmentPrice)}</b></div>
          </div>
        </div>
      )}

      {mode === "DEPOSITA" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Età (anni) *</span>
              <input name="age" type="number" step="0.25" min="0" max="60" className="input" required defaultValue={defaultAge} />
            </label>
            <label className="block">
              <span className="field-label">Targa *</span>
              <input name="plate" className="input uppercase" required maxLength={40} placeholder="AB123" autoComplete="off" />
            </label>
          </div>
          <div>
            <span className="field-label">Sesso *</span>
            <input type="hidden" name="sex" value={sex} />
            <div className="grid grid-cols-2 gap-2">
              {(["MASCHIO", "FEMMINA"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={sex === s} onClick={() => setSex(s)} className={clsx("btn", sex === s ? "btn-primary" : "btn-secondary")}>
                  {s === "MASCHIO" ? "Maschio" : "Femmina"}
                </button>
              ))}
            </div>
          </div>
          <label className="block"><span className="field-label">Note</span><textarea name="notes" className="input" maxLength={2000} placeholder="Facoltative" /></label>
          <button className="btn btn-primary w-full" disabled={!requestId}>Deposita in stalla</button>
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-fg-3">Per la vendita al blip bastano razza e manto. Il cavallo non entra in stalla.</p>
          <button className="btn btn-primary w-full" disabled={!requestId || !coat || coat.governmentPrice == null}>
            Vendi al blip {coat ? `· ${money(coat.governmentPrice)}` : ""}
          </button>
        </>
      )}
    </ActionForm>
  );
}
