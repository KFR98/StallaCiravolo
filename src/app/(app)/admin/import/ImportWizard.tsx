"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { previewImport, confirmImport } from "../actions";
import type { ParsedListino } from "@/lib/excel-import";
import { money } from "@/lib/format";
import clsx from "clsx";

type Preview = { parsed: ParsedListino; newCoats: number; existingCoats: number };

export function ImportWizard() {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"solo_nuovi" | "aggiorna">("solo_nuovi");
  const [showRows, setShowRows] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await previewImport(fd);
            if (r.ok) { setPreview(r.data as Preview); toast.success(r.message); } else toast.error(r.error);
          });
        }}
      >
        <label className="block flex-1"><span className="field-label">File Excel (.xlsx)</span><input type="file" name="file" accept=".xlsx" required className="block w-full text-[15px]" /></label>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Analisi…" : "Analizza file"}</button>
      </form>

      {preview && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat l="Razze" v={preview.parsed.breeds.length} />
            <Stat l="Manti" v={preview.parsed.rows.length} />
            <Stat l="Manti nuovi" v={preview.newCoats} />
            <Stat l="Anomalie" v={preview.parsed.anomalies.length} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[18px] text-fg">Razze rilevate</h3>
              <ul className="columns-1 text-[15px] sm:columns-2">
                {preview.parsed.breeds.map((b) => <li key={b.name}>{b.name} <span className="text-fg-3">({b.coats})</span>{b.isCustom && <span className="badge badge-neutral ml-1 !text-[10px]">mod</span>}</li>)}
              </ul>
              <p className="mt-2 text-[14px] text-fg-3">Statistiche: {preview.parsed.statColumns.map((s) => s.label).join(", ")}</p>
              <p className="text-[14px] text-fg-3">Fogli non usati per il catalogo: {preview.parsed.ignoredSheets.join(", ") || "—"}</p>
            </div>
            <div>
              <h3 className="mb-2 text-[18px] text-fg">Anomalie e correzioni</h3>
              <ul className="max-h-[320px] space-y-1 overflow-y-auto text-[14px]">
                {preview.parsed.anomalies.map((a, i) => (
                  <li key={i} className="flex items-start gap-2"><span className={clsx("badge mt-0.5 shrink-0 !text-[10px]", a.level === "error" ? "badge-accent" : a.level === "warning" ? "badge-neutral" : "badge-neutral")}>{a.level === "error" ? "errore" : a.level === "warning" ? "avviso" : "info"}</span><span>{a.row ? `R${a.row}: ` : ""}{a.message}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowRows((s) => !s)}>{showRows ? "Nascondi" : "Mostra"} tutte le righe</button>
          {showRows && (
            <div className="max-h-[420px] overflow-auto">
              <table className="tbl">
                <thead><tr><th>Riga</th><th>Razza</th><th>Manto</th><th className="num">TOT 5-10</th><th className="num">TOT 11-16</th><th className="num">Governo</th><th className="num">Listino Gov</th>{preview.parsed.statColumns.map((s) => <th key={s.key} className="num">{s.label}</th>)}</tr></thead>
                <tbody>
                  {preview.parsed.rows.map((r) => (
                    <tr key={r.row}><td>{r.row}</td><td>{r.breedName}</td><td>{r.coatName}</td><td className="num">{money(r.prices.salePriceA)}</td><td className="num">{money(r.prices.salePriceB)}</td><td className="num">{money(r.prices.governmentPrice)}</td><td className="num">{money(r.prices.govListPrice)}</td>{preview.parsed.statColumns.map((s) => <td key={s.key} className="num">{r.stats[s.key] ?? "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="rounded-[3px] border border-border bg-accent-soft p-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "solo_nuovi"} onChange={() => setMode("solo_nuovi")} />Aggiungi solo razze/manti nuovi (non tocca quelli esistenti)</label>
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "aggiorna"} onChange={() => setMode("aggiorna")} />Aggiorna anche prezzi e statistiche esistenti</label>
            </div>
            <p className="mt-2 text-[13px] text-fg-3">Nessun dato viene eliminato. Le modifiche ai prezzi finiscono nello storico prezzi. Immagini e descrizioni non vengono toccate.</p>
            <button
              className="btn btn-primary mt-3"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Confermi l'importazione nel database?")) return;
                start(async () => {
                  const r = await confirmImport(JSON.stringify(preview.parsed), mode);
                  if (r.ok) { toast.success(r.message); setPreview(null); router.refresh(); } else toast.error(r.error);
                });
              }}
            >
              Conferma importazione
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ l, v }: { l: string; v: number }) {
  return <div className="rounded-[3px] border border-border bg-surface-2 p-3"><div className="eyebrow">{l}</div><div className="text-[26px] font-semibold">{v}</div></div>;
}
