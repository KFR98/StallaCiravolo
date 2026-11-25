"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Bell, X, ChevronRight, Check, CheckCheck, RotateCcw } from "lucide-react";
import { dismissNotices, restoreNotices } from "@/app/(app)/notification-actions";

export type BellNotice = { id: string; key: string; section: string; group: string; title: string; detail: string; href: string; level: "warn" | "alarm" };
export type BellData = { items: BellNotice[]; total: number; hidden: number; badges: Partial<Record<string, { n: number }>> };

/** Pagina della sezione, per "vedi tutte" quando nell'elenco non ci stanno tutte. */
const SECTION_PAGE: Record<string, string> = { stalla: "/stalla", bottega: "/bottega?tab=richieste", bacheca: "/prenotazioni?mie=1", soldi: "/stipendi", admin: "/admin/audit?periodo=1" };

/**
 * Porta alla cosa precisa: aspetta che l'elemento con quell'id compaia sulla pagina (anche dopo il cambio pagina),
 * lo fa scorrere in vista e lo illumina per qualche secondo.
 */
export function flashTarget(id: string) {
  if (!id) return;
  const started = Date.now();
  const tick = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      el.classList.remove("notice-flash");
      void el.offsetWidth; // riparte l'animazione anche se era già illuminato
      el.classList.add("notice-flash");
      window.setTimeout(() => el.classList.remove("notice-flash"), 3200);
      return;
    }
    if (Date.now() - started < 5000) window.setTimeout(tick, 120);
  };
  tick();
}

/** All'apertura di una pagina con #ancora nell'indirizzo (es. link copiato) illumina la cosa indicata. */
export function HashFlash() {
  const path = usePathname();
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (h) flashTarget(h);
  }, [path]);
  return null;
}

export function NotificationBell({ initial, tone = "dark" }: { initial: BellData; tone?: "dark" }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<BellData>(initial);
  const [loading, setLoading] = useState(false);
  const path = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/notifiche", { cache: "no-store" });
      const d = r.ok ? ((await r.json()) as BellData) : null;
      if (d && Array.isArray(d.items)) setData({ items: d.items, total: d.total, hidden: d.hidden ?? 0, badges: d.badges ?? {} });
    } catch { /* resta l'elenco che c'era */ }
  }, []);

  /** "segna come vista": vale solo per me; il server controlla che la notifica sia davvero mia */
  const dismiss = (keys: string[] | "tutte") => {
    const all = keys === "tutte";
    const drop = new Set(all ? data.items.map((i) => i.key) : keys);
    // si toglie subito dall'elenco, poi si chiede al server
    setData((d) => ({ ...d, items: d.items.filter((i) => !drop.has(i.key)), total: all ? 0 : Math.max(0, d.total - drop.size), hidden: d.hidden + (all ? d.total : drop.size) }));
    startBusy(async () => {
      const f = new FormData();
      f.set("keys", all ? "tutte" : keys.join(","));
      const r = await dismissNotices(f);
      setMsg(r.ok ? r.message ?? null : r.error ?? "Errore");
      await reload();
      router.refresh();
    });
  };
  const restore = () => startBusy(async () => {
    const r = await restoreNotices();
    setMsg(r.ok ? r.message ?? null : r.error ?? "Errore");
    await reload();
    router.refresh();
  });

  // il layout manda dati nuovi quando la pagina si aggiorna
  useEffect(() => setData(initial), [initial]);
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setMsg(null);
    reload().finally(() => alive && setLoading(false));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { alive = false; document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, reload]);

  const groups: [string, BellNotice[]][] = [];
  for (const it of data.items) {
    const g = groups.find(([k]) => k === it.group);
    if (g) g[1].push(it); else groups.push([it.group, [it]]);
  }
  const cose = (n: number) => `${n} ${n === 1 ? "cosa" : "cose"} da fare`;
  const label = data.total ? `Notifiche: ${cose(data.total)}` : "Notifiche: niente da fare";

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog"
        className={clsx("btn btn-ghost btn-icon relative", tone === "dark" && "!text-neutral-300 hover:!bg-white/10 hover:!text-white")}>
        <Bell size={19} className={clsx(data.total > 0 && "bell-ring")} />
        {data.total > 0 && <span className="nav-badge nav-badge-dot !top-0.5 !right-0" aria-hidden="true">{data.total > 99 ? "99+" : data.total}</span>}
      </button>
      {open && (
        <div ref={panel} role="dialog" aria-label="Notifiche"
          className="notif-panel fixed inset-x-2 top-[calc(max(0.625rem,env(safe-area-inset-top))+56px)] z-[60] flex max-h-[min(75dvh,620px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141210] text-neutral-200 shadow-2xl sm:right-3 sm:left-auto sm:w-[420px] lg:top-4 lg:right-auto lg:left-[256px]">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <div className="font-display text-[13px] font-semibold tracking-[0.18em] text-white uppercase">Notifiche</div>
              <div className="text-[12.5px] text-neutral-400" aria-live="polite">{loading || busy ? "Aggiorno…" : msg ?? (data.total ? cose(data.total) : "Tutto in ordine")}</div>
            </div>
            <span className="flex-1" />
            {data.items.length > 0 && (
              <button type="button" onClick={() => dismiss("tutte")} disabled={busy} title="Segna tutte come viste (solo per te)"
                className="btn btn-ghost btn-sm !text-neutral-300 hover:!bg-white/10 hover:!text-white"><CheckCheck size={16} /> <span className="max-sm:sr-only">Tutte viste</span></button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Chiudi notifiche" className="btn btn-ghost btn-icon !text-neutral-300 hover:!bg-white/10 hover:!text-white"><X size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-[14px] text-neutral-400">Nessuna notifica: non c&apos;è niente che ti aspetta.</p>
            ) : groups.map(([g, list]) => {
              const n = data.badges[list[0].section]?.n ?? list.length;
              return (
                <section key={g} className="border-b border-white/5 last:border-0">
                  <h3 className="px-4 pt-3 pb-1 font-display text-[11.5px] font-semibold tracking-[0.16em] text-[#ff5d55] uppercase">{g} <span className="text-neutral-500">· {n}</span></h3>
                  <ul>
                    {list.map((it) => (
                      <li key={it.key} className="flex items-stretch">
                        <Link href={it.href} onClick={() => { setOpen(false); flashTarget(it.href.split("#")[1] ?? it.id); }}
                          className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-1 pl-4 transition-colors hover:bg-white/5 focus-visible:bg-white/5">
                          <span className={clsx("mt-1.5 size-2.5 shrink-0 rounded-full", it.level === "alarm" ? "bg-[#e01f27]" : "bg-[#f0a020]")} aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold text-white">{it.title}</span>
                            <span className="block truncate text-[12.5px] text-neutral-400">{it.detail}</span>
                          </span>
                          <ChevronRight size={16} className="mt-1 shrink-0 text-neutral-500" />
                        </Link>
                        <button type="button" onClick={() => dismiss([it.key])} disabled={busy}
                          aria-label={`Segna come vista: ${it.title}`} title="Segna come vista (sparisce solo per te; torna se la situazione cambia)"
                          className="flex w-11 shrink-0 items-center justify-center text-neutral-500 transition-colors hover:bg-white/5 hover:text-[#7bd88f]">
                          <Check size={17} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {n > list.length && (
                    <Link href={SECTION_PAGE[list[0].section] ?? "/"} onClick={() => setOpen(false)} className="block px-4 pb-3 text-[13px] font-semibold text-[#ff5d55] hover:underline">
                      e altre {n - list.length}: apri la sezione →
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
          <div className="border-t border-white/10 px-4 py-2.5 text-[12px] text-neutral-500">
            <p>Tocca una voce per andare alla schermata esatta, oppure <Check size={12} className="inline" /> per segnarla come vista (solo per te). Spariscono anche da sole quando la cosa è sistemata.</p>
            {data.hidden > 0 && (
              <button type="button" onClick={restore} disabled={busy} className="mt-1.5 inline-flex items-center gap-1.5 font-semibold text-neutral-300 hover:text-white hover:underline">
                <RotateCcw size={13} /> Fai tornare {data.hidden === 1 ? "la notifica vista" : `le ${data.hidden} notifiche viste`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
