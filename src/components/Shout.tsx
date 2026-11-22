"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Check, Pencil, Megaphone } from "lucide-react";
import { ActionForm } from "@/components/ActionForm";
import { saveShout } from "@/app/(app)/ufficio/actions";

/** Copia negli appunti: API moderna in https, ripiego per http (es. accesso diretto con IP e porta). */
async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ripiego sotto */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Strillone: annuncio personale da copiare e incollare in gioco quando la stalla è aperta. */
export function Shout({ text, maxLength }: { text: string | null; maxLength: number }) {
  const [editing, setEditing] = useState(!text);
  const [draft, setDraft] = useState(text ?? "");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!text) return;
    if (await copyText(text)) {
      setCopied(true);
      toast.success("Strillone copiato: incollalo in gioco.");
      setTimeout(() => setCopied(false), 1800);
    } else toast.error("Copia non riuscita: seleziona il testo e copialo a mano.");
  };

  return (
    <section className="card fade-up">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="h-display flex items-center gap-2 text-[18px]"><Megaphone size={18} className="text-accent-text" /> Strillone</h2>
        {text && !editing && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(text); setEditing(true); }}><Pencil size={15} /> Modifica</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={copy}>{copied ? <><Check size={15} /> Copiato</> : <><Copy size={15} /> Copia</>}</button>
          </div>
        )}
      </header>
      <div className="card-pad">
        {editing ? (
          <ActionForm action={saveShout} onSuccess={() => setEditing(false)} className="space-y-2">
            <p className="text-[13.5px] text-fg-3">Il tuo annuncio da incollare in gioco quando la stalla è aperta. Viene copiato esattamente com&apos;è, con “/”, emoji e spazi.</p>
            <textarea
              name="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={maxLength}
              rows={4}
              className="input font-mono text-[14px]"
              placeholder="/strillone …"
              aria-label="Testo dello strillone"
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={draft.length > maxLength * 0.9 ? "text-[12.5px] text-warn" : "text-[12.5px] text-fg-3"}>{draft.length}/{maxLength}</span>
              <span className="flex-1" />
              {text && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDraft(text); setEditing(false); }}>Annulla</button>}
              <button className="btn btn-primary btn-sm">Salva</button>
            </div>
          </ActionForm>
        ) : (
          <button type="button" onClick={copy} title="Tocca per copiare"
            className="block w-full rounded-lg border border-dashed border-border-strong bg-surface-2 p-3 text-left font-mono text-[14px] break-words whitespace-pre-wrap transition-colors hover:border-accent">
            {text}
          </button>
        )}
      </div>
    </section>
  );
}
