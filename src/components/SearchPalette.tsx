"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, CornerDownLeft } from "lucide-react";
import clsx from "clsx";
import { HorseThumb } from "./ui";

type Hit = { group: string; title: string; sub?: string; href: string; image?: string | null };
type Page = { label: string; href: string };

/**
 * Ricerca globale: Ctrl+K (o ⌘K) da qualsiasi pagina. Cerca cavalli, targhe, clienti, vendite, catalogo, oggetti, persone
 * e le pagine del menu. Frecce + Invio per aprire.
 */
export function SearchPalette({ pages, open, onOpenChange }: { pages: Page[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); onOpenChange(true); }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);
  useEffect(() => { if (open) { setQ(""); setHits([]); setSel(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);

  // risultati dal server, con un piccolo ritardo mentre si scrive
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/cerca?q=${encodeURIComponent(t)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d) => { setHits(d.hits ?? []); setSel(0); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]);

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const pageHits: Hit[] = useMemo(
    () => (q.trim() ? pages.filter((p) => norm(p.label).includes(norm(q.trim()))).map((p) => ({ group: "Pagine", title: p.label, href: p.href })) : pages.map((p) => ({ group: "Pagine", title: p.label, href: p.href }))),
    [pages, q],
  );
  const all = [...pageHits.slice(0, q.trim() ? 5 : 12), ...hits];
  const go = (h: Hit) => { onOpenChange(false); router.push(h.href); };

  if (!open) return null;
  let idx = -1;
  const groups = [...new Set(all.map((h) => h.group))];
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-3 pt-[10vh]" onClick={() => onOpenChange(false)} role="presentation">
      <div className="card w-full max-w-[620px] overflow-hidden shadow-2xl outline-2 outline-offset-0 outline-transparent transition-[outline-color] focus-within:outline-[#c8161d]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cerca nel gestionale">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={18} className="shrink-0 text-fg-3" aria-hidden="true" />
          <input
            ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca targa, cavallo, cliente, oggetto, persona…"
            className="min-h-13 w-full border-0 bg-transparent py-3 text-[16px] shadow-none outline-none focus:shadow-none" style={{ boxShadow: "none", outline: "none" }} aria-label="Cerca"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(all.length - 1, s + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === "Enter" && all[sel]) { e.preventDefault(); go(all[sel]); }
            }}
          />
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onOpenChange(false)} aria-label="Chiudi"><X size={16} /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {q.trim().length >= 2 && !loading && hits.length === 0 && pageHits.length === 0 && <p className="px-3 py-6 text-center text-fg-3">Nessun risultato per “{q.trim()}”.</p>}
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <div className="eyebrow px-2.5 pt-2 pb-1">{g}</div>
              {all.filter((h) => h.group === g).map((h) => {
                idx = all.indexOf(h);
                const i = idx;
                return (
                  <button key={`${h.group}-${h.href}-${h.title}-${i}`} type="button" onClick={() => go(h)} onMouseEnter={() => setSel(i)}
                    className={clsx("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left", sel === i ? "bg-surface-3" : "hover:bg-surface-2")}>
                    {h.image !== undefined && <HorseThumb src={h.image} size={32} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      {h.sub && <span className="block truncate text-[12.5px] text-fg-3">{h.sub}</span>}
                    </span>
                    {sel === i && <CornerDownLeft size={14} className="shrink-0 text-fg-3" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
          {loading && <p className="px-3 py-2 text-[13px] text-fg-3">Cerco…</p>}
        </div>
        <div className="hidden border-t border-border px-3 py-2 text-[12px] text-fg-3 sm:block">↑ ↓ per scegliere · Invio per aprire · Esc per chiudere · Ctrl+K da ogni pagina</div>
      </div>
    </div>
  );
}
