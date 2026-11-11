"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { saveSettings } from "../actions";
import type { Settings } from "@/lib/settings";

const EVERY = [
  [6, "Ogni 6 ore"],
  [12, "Ogni 12 ore"],
  [24, "Una volta al giorno"],
  [48, "Ogni 2 giorni"],
  [168, "Una volta a settimana"],
] as const;

export function SettingsForm({ s, inStable }: { s: Settings; inStable: number }) {
  const [auto, setAuto] = useState(s.backupAuto);
  const everyOptions = EVERY.some(([h]) => h === s.backupEveryHours) ? EVERY : [...EVERY, [s.backupEveryHours, `Ogni ${s.backupEveryHours} ore`] as const];
  return (
    <ActionForm
      action={saveSettings}
      confirm={(fd) =>
        Number(fd.get("daysPerYear")) !== s.daysPerYear
          ? `Stai cambiando l'avanzamento dell'età da ${s.daysPerYear} a ${fd.get("daysPerYear")} giorni per anno.\nL'età già maturata dai ${inStable} cavalli in stalla viene conservata. Confermi?`
          : null
      }
      className="space-y-7"
    >
      <Section title="Generale">
        <label className="block sm:col-span-2"><span className="field-label">Nome della stalla</span><input name="stableName" defaultValue={s.stableName} className="input" required /></label>
      </Section>

      <Section title="Età dei cavalli" hint="L'età avanza da sola dalla data di inserimento. Se cambi il ritmo, l'età già maturata non si azzera.">
        <Num name="daysPerYear" label="Giorni reali per 1 anno" value={s.daysPerYear} step="any" min="0.01" />
        <Num name="defaultCaptureAge" label="Età proposta alla cattura" value={s.defaultCaptureAge} step="any" min="0" />
        <Num name="minSaleAge" label="Età minima per vendere" value={s.minSaleAge} step="any" min="0" />
      </Section>

      <Section title="Prezzi e sconti" hint="Oltre la seconda fascia il prezzo è libero. Direttore e admin non hanno limite di sconto.">
        <Num name="bracketAMax" label='Fascia "5-10": fino a (anni)' value={s.bracketAMax} step="1" min="0" />
        <Num name="bracketBMax" label='Fascia "11-16": fino a (anni)' value={s.bracketBMax} step="1" min="0" />
        <Num name="maxDiscountPercent" label="Sconto massimo dipendenti %" value={s.maxDiscountPercent} step="any" min="0" max="100" />
      </Section>

      <Section title="Gravidanza" hint="Dopo questi giorni l'etichetta INCINTA diventa FAI PARTORIRE. Puoi usare anche decimali (es. 2,5).">
        <Num name="pregnancyDays" label="Giorni prima di “Fai partorire”" value={s.pregnancyDays} step="any" min="0.1" />
      </Section>

      <Section title="Stipendi (percentuali globali)" hint="Ogni tipo di vendita ha la sua percentuale. Quelle personali si impostano dalla scheda stipendi del dipendente. Le settimane già pagate non cambiano.">
        <Num name="pctStable" label="Vendite in stalla %" value={s.pctStable} step="any" min="0" max="100" />
        <Num name="pctGov" label="Vendite al blip %" value={s.pctGov} step="any" min="0" max="100" />
        <Num name="pctItems" label="Vendite oggetti %" value={s.pctItems} step="any" min="0" max="100" />
      </Section>

      <Section title="Backup automatico" hint="Il gestionale salva da solo una copia completa del database. I backup più vecchi del periodo scelto vengono eliminati (resta sempre almeno l'ultimo).">
        <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border border-border px-3">
          <input type="checkbox" name="backupAuto" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span className="font-semibold">{auto ? "Attivo" : "Disattivato"}</span>
        </label>
        <label className="block">
          <span className="field-label">Frequenza</span>
          <select name="backupEveryHours" defaultValue={s.backupEveryHours} className="input" disabled={!auto}>
            {everyOptions.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
          </select>
          {!auto && <input type="hidden" name="backupEveryHours" value={s.backupEveryHours} />}
        </label>
        <Num name="backupDays" label="Conserva i backup per (giorni)" value={s.backupDays} step="1" min="1" />
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-surface px-4 py-3 sm:-mx-5 sm:px-5">
        <button className="btn btn-primary">Salva impostazioni</button>
      </div>
    </ActionForm>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border pb-6 last-of-type:border-0">
      <h3 className="h-display mb-1 text-[18px]">{title}</h3>
      {hint && <p className="mb-3 max-w-3xl text-[13.5px] text-fg-3">{hint}</p>}
      <div className="grid gap-4 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Num({ name, label, value, step, min, max }: { name: string; label: string; value: number; step: string; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} type="number" inputMode="decimal" defaultValue={value} step={step} min={min} max={max} className="input" required />
    </label>
  );
}
