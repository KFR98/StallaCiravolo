"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { LayoutDashboard, Warehouse, Receipt, Store, Map, BookOpen, NotebookPen, Users, Shield, LogOut, Menu, X, Plus, Wallet, Search } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { DiscordBrushDefs, DiscordLink, type DiscordStyle } from "./DiscordLink";
import { SearchPalette } from "./SearchPalette";
import { NotificationBell, HashFlash, type BellData } from "./NotificationBell";

const ICONS = { dashboard: LayoutDashboard, stable: Warehouse, sales: Receipt, shop: Store, map: Map, catalog: BookOpen, notes: NotebookPen, staff: Users, cash: Wallet, admin: Shield };

export type NavItem = { key: string; href: string; label: string; icon: keyof typeof ICONS; match: string[]; mobile?: boolean; badge?: { n: number; title: string } };

export function AppShell({
  items,
  mobileOrder = [],
  user,
  stableName,
  canCapture,
  discordUrl,
  discordStyle,
  logout,
  bell = null,
  children,
}: {
  items: NavItem[];
  /** ordine delle voci nella barra in basso del telefono */
  mobileOrder?: string[];
  user: { displayName: string; roleLabel: string };
  stableName: string;
  canCapture: boolean;
  discordUrl: string | null;
  discordStyle: DiscordStyle;
  logout: () => Promise<void>;
  /** campanella delle notifiche (null se spenta in Impostazioni o senza permesso) */
  bell?: BellData | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const isActive = (it: NavItem) => it.match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(m + "/")));

  const links = (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = isActive(it);
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={19} strokeWidth={1.8} className={clsx("shrink-0", active && "text-[#ff5d55]")} />
              <span className="flex-1">{it.label}</span>
              {it.badge && <span className="nav-badge" title={it.badge.title} aria-label={it.badge.title}>{it.badge.n > 99 ? "99+" : it.badge.n}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const brand = (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo.png" alt="" width={42} height={42} className="size-[38px] shrink-0 lg:size-[42px]" />
      <span className="min-w-0">
        <span className="block truncate font-brand text-[22px] leading-none text-white lg:text-[18px]">{stableName}</span>
        <span className="mt-1 block truncate font-display text-[11px] font-semibold tracking-[0.3em] whitespace-nowrap text-[#ff5d55] uppercase max-sm:tracking-[0.18em] lg:text-[10px] lg:tracking-[0.24em]">Gestionale stalla</span>
      </span>
    </Link>
  );

  const discord = discordUrl && <div className="px-1"><DiscordLink href={discordUrl} style={discordStyle} variant="menu" /></div>;

  const userBox = (
    <div className="flex items-center gap-2 border-t border-white/10 px-3 pt-3">
      <Link href="/profilo" className="min-w-0 flex-1 rounded-md px-1 py-0.5 hover:bg-white/5" title="Il mio profilo e storico">
        <div className="truncate text-[14.5px] font-semibold text-white">{user.displayName}</div>
        <div className="text-[12.5px] text-neutral-400">{user.roleLabel} · profilo</div>
      </Link>
      <ThemeToggle className="!text-neutral-300 hover:!bg-white/10 hover:!text-white" />
      <form action={logout}>
        <button className="btn btn-ghost btn-icon !text-neutral-300 hover:!bg-white/10 hover:!text-white" aria-label="Esci" title="Esci">
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );

  const searchBtn = (
    <button type="button" onClick={() => { setOpen(false); setSearchOpen(true); }}
      className="flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[14px] text-neutral-400 transition-colors hover:border-white/20 hover:text-white">
      <Search size={16} className="shrink-0" />
      <span className="flex-1 text-left">Cerca…</span>
      <kbd className="hidden rounded border border-white/15 px-1.5 text-[11px] text-neutral-500 lg:inline">Ctrl K</kbd>
    </button>
  );

  const cta = canCapture && (
    <Link href="/stalla?registra=1" className="btn btn-primary w-full !bg-[#c8161d] hover:!bg-[#e01f27]">
      <Plus size={18} /> Registra cattura
    </Link>
  );

  return (
    <div className="min-h-dvh">
      {discordUrl && <DiscordBrushDefs />}
      <HashFlash />
      {/* Sidebar desktop: sempre scura, come l'intestazione del sito Rockstar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-5 border-r border-white/5 bg-[#0b0a09] px-3 py-5 lg:flex">
        <div className="px-2">{brand}</div>
        <div className="space-y-2 px-1">{cta}<div className="flex items-center gap-1.5"><div className="min-w-0 flex-1">{searchBtn}</div>{bell && <NotificationBell initial={bell} />}</div></div>
        <nav className="flex-1 overflow-y-auto" aria-label="Menu principale">{links}</nav>
        {discord}
        {userBox}
      </aside>
      <SearchPalette pages={items.map((i) => ({ label: i.label, href: i.href }))} open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Barra superiore mobile */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-white/5 bg-[#0b0a09] px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 lg:hidden">
        {brand}
        <div className="flex items-center gap-1">
          {/* il tema chiaro/scuro resta nel menu (riquadro dell'utente): qui la ricerca, per non tagliare il nome */}
          {bell && <NotificationBell initial={bell} />}
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Cerca" className="btn btn-ghost btn-icon !text-neutral-300"><Search size={19} /></button>
          <button onClick={() => setOpen(true)} aria-label={items.some((i) => i.badge) ? "Apri menu (ci sono cose da fare)" : "Apri menu"} className="btn btn-ghost btn-icon relative !text-white">
            <Menu />
            {items.some((i) => i.badge) && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-[#e01f27] ring-2 ring-[#0b0a09]" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {/* Drawer mobile */}
      <div className={clsx("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div className={clsx("absolute inset-0 bg-black/60 transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside className={clsx("absolute inset-y-0 right-0 flex w-[290px] flex-col gap-4 bg-[#0b0a09] px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] transition-transform duration-300 ease-[var(--ease-drawer)]", open ? "translate-x-0" : "translate-x-full")}>
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-[13px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Menu</span>
            <button onClick={() => setOpen(false)} aria-label="Chiudi menu" className="btn btn-ghost btn-icon !text-white"><X /></button>
          </div>
          <div className="space-y-2 px-1">{cta}{searchBtn}</div>
          <nav className="flex-1 overflow-y-auto" aria-label="Menu principale">{links}</nav>
          {discord}
          {userBox}
        </aside>
      </div>

      {/* overflow-x-clip: rete di sicurezza, nessun contenuto può allargare la pagina oltre lo schermo */}
      <main className="min-w-0 overflow-x-clip pb-24 lg:pb-0 lg:pl-[248px]">
        <div className="mx-auto max-w-[1680px] min-w-0 px-4 py-5 sm:px-6 sm:py-7">{children}</div>
      </main>

      {/* Barra inferiore mobile: 4 voci principali */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#0b0a09] pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigazione rapida">
        {items.filter((i) => i.mobile).sort((a, b) => mobileOrder.indexOf(a.key) - mobileOrder.indexOf(b.key)).slice(0, 4).map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(it);
          return (
            <Link key={it.href} href={it.href} className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11.5px] font-medium", active ? "text-white" : "text-neutral-400")}>
              <span className="relative">
                <Icon size={20} className={active ? "text-[#ff5d55]" : ""} />
                {it.badge && <span className="nav-badge nav-badge-dot" title={it.badge.title} aria-label={it.badge.title}>{it.badge.n > 9 ? "9+" : it.badge.n}</span>}
              </span>
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
