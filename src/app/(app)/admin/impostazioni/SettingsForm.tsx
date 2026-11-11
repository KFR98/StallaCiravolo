"use client";

import { ActionForm } from "@/components/ActionForm";
import { saveSettings } from "../actions";
import type { Settings } from "@/lib/settings";

export function SettingsForm({ s, inStable }: { s: Settings; inStable: number }) {
  return (
    <ActionForm
      action={saveSettings}
      confirm={(fd) =>
        Number(fd.get("daysPerYear")) !== s.daysPerYear
          ? `Stai cambiando l'avanzamento dell'età da ${s.daysPerYear} a ${fd.get("daysPerYear")} giorni per anno.\nL'età già maturata dai ${inStable} cavalli in stalla viene conservata. Confermi?`
          : null
      }
      className="space-y-6"
    >
      <Section title="Età dei cavalli" hint="L'età avanza da sola dalla data di inserimento. Se cambi il ritmo, l'età già maturata non si azzera.">
        <Num name="daysPerYear" label="Giorni reali per 1 anno" value={s.daysPerYear} step="0.01" min="0.01" />
        <Num name="defaultCaptureAge" label="Età proposta alla cattura" value={s.defaultCaptureAge} step="0.25" min="0" />
        <Num name="minSaleAge" label="Età minima per vendere" value={s.minSaleAge} step="0.25" min="0" />
      </Section>
      <Section title="Fasce di prezzo" hint="Oltre la seconda fascia il prezzo è libero. Direttore e admin non hanno limite di sconto.">
        <Num name="bracketAMax" label='Fascia "5-10": fino a (anni)' value={s.bracketAMax} step="1" min="0" />
        <Num name="bracketBMax" label='Fascia "11-16": fino a (anni)' value={s.bracketBMax} step="1" min="0" />
        <Num name="maxDiscountPercent" label="Sconto massimo dipendenti %" value={s.maxDiscountPercent} step="1" min="0" max="100" />
      </Section>
      <Section title="Stipendi (percentuali globali)" hint="Ogni tipo di vendita ha la sua percentuale. Le percentuali personali si impostano dalla scheda stipendi del dipendente. Le settimane già pagate non cambiano.">
        <Num name="pctStable" label="Vendite in stalla %" value={s.pctStable} step="0.01" min="0" max="100" />
        <Num name="pctGov" label="Vendite al blip %" value={s.pctGov} step="0.01" min="0" max="100" />
        <Num name="pctItems" label="Vendite oggetti %" value={s.pctItems} step="0.01" min="0" max="100" />
      </Section>
      <Section title="Gravidanza e backup">
        <Num name="pregnancyDays" label="Giorni prima di “Fai partorire”" value={s.pregnancyDays} step="0.5" min="0.1" />
        <Num name="backupDays" label="Conserva i backup per (giorni)" value={s.backupDays} step="1" min="1" />
        <label className="block"><span className="field-label">Nome della stalla</span><input name="stableName" defaultValue={s.stableName} className="input" required /></label>
      </Section>
      <button className="btn btn-primary">Salva impostazioni</button>
    </ActionForm>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="h-display mb-1 text-[18px]">{title}</h3>
      {hint && <p className="mb-3 text-[13.5px] text-fg-3">{hint}</p>}
      <div className="grid gap-4 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Num({ name, label, value, step, min, max }: { name: string; label: string; value: number; step: string; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input name={name} type="number" defaultValue={value} step={step} min={min} max={max} className="input" required />
    </label>
  );
}
