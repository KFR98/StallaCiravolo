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
          ? `Stai cambiando l'avanzamento dell'età da ${s.daysPerYear} a ${fd.get("daysPerYear")} giorni per anno.\nL'età già maturata dai ${inStable} cavalli in stalla verrà conservata e da ora avanzerà con il nuovo ritmo. Confermi?`
          : null
      }
      className="space-y-6"
    >
      <section>
        <h3 className="title-fell mb-3 text-[19px] text-leather">Impostazioni età</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Num name="daysPerYear" label="Giorni reali per 1 anno di età" value={s.daysPerYear} step="0.01" min="0.01" />
          <Num name="defaultCaptureAge" label="Età proposta alla cattura" value={s.defaultCaptureAge} step="0.25" min="0" />
          <Num name="minSaleAge" label="Età minima per vendere" value={s.minSaleAge} step="0.25" min="0" />
        </div>
        <p className="mt-2 text-[14px] text-ink-soft italic">L&apos;età avanza da sola dalla data di inserimento. Se cambi il ritmo, l&apos;età già maturata non si azzera. L&apos;età di un singolo cavallo si corregge dalla sua scheda.</p>
      </section>
      <section>
        <h3 className="title-fell mb-3 text-[19px] text-leather">Fasce di prezzo per età</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Num name="bracketAMax" label='Fascia "TOT 5-10": fino a (anni)' value={s.bracketAMax} step="1" min="0" />
          <Num name="bracketBMax" label='Fascia "TOT 11-16": fino a (anni)' value={s.bracketBMax} step="1" min="0" />
          <Num name="maxDiscountPercent" label="Sconto massimo dipendenti (%)" value={s.maxDiscountPercent} step="1" min="0" max="100" />
        </div>
        <p className="mt-2 text-[14px] text-ink-soft italic">Oltre la seconda fascia il prezzo è libero e lo decide lo stalliere. Direttore e admin non hanno limite di sconto.</p>
      </section>
      <section>
        <h3 className="title-fell mb-3 text-[19px] text-leather">Stipendi</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Num name="salaryPercent" label="Percentuale globale sul lordo (%)" value={s.salaryPercent} step="0.01" min="0" max="100" />
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" name="salaryIncludeStable" defaultChecked={s.salaryIncludeStable} className="size-4 accent-[#5a3a22]" />Conta le vendite dalla stalla</label>
          <label className="flex items-center gap-2 pt-6"><input type="checkbox" name="salaryIncludeGov" defaultChecked={s.salaryIncludeGov} className="size-4 accent-[#5a3a22]" />Conta le vendite al Governo</label>
        </div>
        <p className="mt-2 text-[14px] text-ink-soft italic">Le percentuali personali si impostano dalla pagina Stipendi. Le settimane già pagate non vengono ricalcolate.</p>
      </section>
      <section>
        <h3 className="title-fell mb-3 text-[19px] text-leather">Generale</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block sm:col-span-2"><span className="label mb-1 block">Nome della stalla</span><input name="stableName" defaultValue={s.stableName} className="input" required /></label>
        </div>
      </section>
      <button className="btn btn-gold">Salva impostazioni</button>
    </ActionForm>
  );
}

function Num({ name, label, value, step, min, max }: { name: string; label: string; value: number; step: string; min?: string; max?: string }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input name={name} type="number" defaultValue={value} step={step} min={min} max={max} className="input" required />
    </label>
  );
}
