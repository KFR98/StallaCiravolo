"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { AUDIT_ACTIONS, LEVELS, LEVEL_HELP, isLevel, type Level } from "@/lib/audit-levels";
import { saveAuditLevels } from "./actions";

type Style = Record<Level, { name: string; color: string }>;

/** Pannello per scegliere nome e colore dei livelli e il livello di ogni azione. */
export function LevelsEditor({ style, overrides, failBurst, failBurstMinutes, newIpLogin }: {
  style: Style; overrides: Record<string, string>; failBurst: number; failBurstMinutes: number; newIpLogin: boolean;
}) {
  const [names, setNames] = useState(style);
  const [levels, setLevels] = useState<Record<string, Level>>(() =>
    Object.fromEntries(Object.entries(AUDIT_ACTIONS).map(([a, d]) => [a, isLevel(overrides[a]) ? overrides[a] : d.level])),
  );
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [a, d] of Object.entries(AUDIT_ACTIONS)) m.set(d.group, [...(m.get(d.group) ?? []), a]);
    return [...m];
  }, []);
  const changed = Object.entries(levels).filter(([a, l]) => AUDIT_ACTIONS[a].level !== l).length;

  return (
    <details className="card mt-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 sm:px-5">
        <SlidersHorizontal size={18} />
        <span className="h-display text-[18px]">Livelli di pericolosità</span>
        <span className="ml-auto text-[13px] text-fg-3">{changed ? `${changed} azioni personalizzate` : "proposta di base"}</span>
      </summary>
      <ActionForm action={saveAuditLevels} className="space-y-6 border-t border-border px-4 py-4 sm:px-5">
        <section>
          <h4 className="mb-1 font-semibold">Nome e colore dei livelli</h4>
          <p className="mb-3 text-[13.5px] text-fg-3">Dal più tranquillo al più grave. Il colore evidenzia la riga nel registro.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LEVELS.map((l) => (
              <div key={l} className="rounded-lg border border-border p-3" style={{ borderLeft: `4px solid ${names[l].color}` }}>
                <div className="mb-2 text-[12.5px] text-fg-3">{LEVEL_HELP[l]}</div>
                <div className="flex gap-2">
                  <input name={`name_${l}`} value={names[l].name} onChange={(e) => setNames({ ...names, [l]: { ...names[l], name: e.target.value } })} className="input" maxLength={16} required aria-label="Nome del livello" />
                  <input type="color" name={`color_${l}`} value={names[l].color} onChange={(e) => setNames({ ...names, [l]: { ...names[l], color: e.target.value } })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border-strong bg-surface p-1" aria-label="Colore del livello" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="mb-1 font-semibold">Allarmi automatici sugli accessi</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="field-label">Accessi falliti dallo stesso IP…</span><input type="number" name="auditFailBurst" defaultValue={failBurst} min={2} step={1} className="input" /></label>
            <label className="block"><span className="field-label">…entro (minuti)</span><input type="number" name="auditFailBurstMinutes" defaultValue={failBurstMinutes} min={1} step={1} className="input" /></label>
            <label className="flex min-h-10 items-center gap-3 self-end rounded-lg border border-border px-3">
              <input type="checkbox" name="auditNewIpLogin" defaultChecked={newIpLogin} />
              <span className="text-[14px]">Segnala l&apos;accesso da un IP mai usato</span>
            </label>
          </div>
          <p className="mt-2 text-[13px] text-fg-3">Superata la soglia, la voce diventa “Tentativi di accesso ripetuti” (di base {names.alarm.name}).</p>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">Livello di ogni azione</h4>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!changed}
              onClick={() => setLevels(Object.fromEntries(Object.entries(AUDIT_ACTIONS).map(([a, d]) => [a, d.level])))}>
              <RotateCcw size={15} /> Torna alla proposta
            </button>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map(([g, actions]) => (
              <fieldset key={g}>
                <legend className="eyebrow mb-1.5">{g}</legend>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {actions.map((a) => (
                    <li key={a} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3" style={{ boxShadow: `inset 3px 0 0 ${names[levels[a]].color}` }}>
                      <span className="min-w-0 flex-1 text-[14px]">
                        {AUDIT_ACTIONS[a].label}
                        {AUDIT_ACTIONS[a].level !== levels[a] && <span className="ml-1.5 text-[12px] text-fg-3">(proposta: {names[AUDIT_ACTIONS[a].level].name})</span>}
                      </span>
                      <select name={`lv_${a}`} value={levels[a]} onChange={(e) => setLevels({ ...levels, [a]: e.target.value as Level })} className="input !min-h-9 !w-auto !py-1 text-[14px]" aria-label={`Livello di ${AUDIT_ACTIONS[a].label}`}>
                        {LEVELS.map((l) => <option key={l} value={l}>{names[l].name}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </div>
        </section>

        <button className="btn btn-primary w-full sm:w-auto">Salva livelli</button>
      </ActionForm>
    </details>
  );
}
