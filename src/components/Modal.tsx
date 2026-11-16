"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // onClose cambia a ogni render (funzione in linea): lo teniamo in un ref così gli effetti
  // sotto girano SOLO all'apertura, e non a ogni carattere digitato nei campi.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Tasto Esc e blocco dello scroll della pagina
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && closeRef.current();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Focus iniziale, una sola volta all'apertura: campo con autofocus, altrimenti il primo campo del contenuto
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const body = bodyRef.current;
      if (!body || body.contains(document.activeElement)) return;
      const el =
        body.querySelector<HTMLElement>("[autofocus]") ??
        body.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]):not([readonly]),select:not([disabled]),textarea:not([disabled])") ??
        body.querySelector<HTMLElement>("button:not([disabled])");
      el?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={() => closeRef.current()}>
      <div
        className={`card fade-up max-h-[94dvh] w-full overflow-y-auto rounded-b-none sm:rounded-xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
          <h3 className="h-display text-[20px]">{title}</h3>
          <button type="button" onClick={() => closeRef.current()} aria-label="Chiudi" className="btn btn-ghost btn-icon -mr-2"><X size={20} /></button>
        </div>
        <div ref={bodyRef} className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
