"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { LayoutDashboard, Warehouse, Receipt, Store, Map, BookOpen, NotebookPen, Users, Shield, LogOut, Menu, X, Plus } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const ICONS = { dashboard: LayoutDashboard, stable: Warehouse, sales: Receipt, shop: Store, map: Map, catalog: BookOpen, notes: NotebookPen, staff: Users, admin: Shield };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; match: string[]; mobile?: boolean };

export function AppShell({
  items,
  user,
  stableName,
  canCapture,
  logout,
  children,
}: {
  items: NavItem[];
  user: { displayName: string; roleLabel: string };
  stableName: string;
  canCapture: boolean;
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
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
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const brand = (
    <Link href="/" className="block">
      <span className="block font-brand text-[22px] leading-none text-white">{stableName}</span>
      <span className="mt-1 block font-display text-[11px] font-semibold tracking-[0.3em] text-[#ff5d55] uppercase">Gestionale stalla</span>
    </Link>
  );

  const userBox = (
    <div className="flex items-center gap-2 border-t border-white/10 px-3 pt-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold text-white">{user.displayName}</div>
        <div className="text-[12.5px] text-neutral-400">{user.roleLabel}</div>
      </div>
      <ThemeToggle className="!text-neutral-300 hover:!bg-white/10 hover:!text-white" />
      <form action={logout}>
        <button className="btn btn-ghost btn-icon !text-neutral-300 hover:!bg-white/10 hover:!text-white" aria-label="Esci" title="Esci">
          <LogOut size={18} />
        </button>
      </form>
    </div>
  );

  const cta = canCapture && (
    <Link href="/stalla?registra=1" className="btn btn-primary w-full !bg-[#c8161d] hover:!bg-[#e01f27]">
      <Plus size={18} /> Registra cattura
    </Link>
  );

  return (
    <div className="min-h-dvh">
      {/* Sidebar desktop: sempre scura, come l'intestazione del sito Rockstar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-5 border-r border-white/5 bg-[#0b0a09] px-3 py-5 lg:flex">
        <div className="px-2">{brand}</div>
        <div className="px-1">{cta}</div>
        <nav className="flex-1 overflow-y-auto" aria-label="Menu principale">{links}</nav>
        {userBox}
      </aside>

      {/* Barra superiore mobile */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-white/5 bg-[#0b0a09] px-4 py-2.5 lg:hidden">
        {brand}
        <div className="flex items-center gap-1">
          <ThemeToggle className="!text-neutral-300" />
          <button onClick={() => setOpen(true)} aria-label="Apri menu" className="btn btn-ghost btn-icon !text-white">
            <Menu />
          </button>
        </div>
      </div>
      {/* Drawer mobile */}
      <div className={clsx("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div className={clsx("absolute inset-0 bg-black/60 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside className={clsx("absolute inset-y-0 right-0 flex w-[290px] flex-col gap-4 bg-[#0b0a09] px-3 py-4 transition-transform", open ? "translate-x-0" : "translate-x-full")}>
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-[13px] font-semibold tracking-[0.2em] text-neutral-400 uppercase">Menu</span>
            <button onClick={() => setOpen(false)} aria-label="Chiudi menu" className="btn btn-ghost btn-icon !text-white"><X /></button>
          </div>
          <div className="px-1">{cta}</div>
          <nav className="flex-1 overflow-y-auto" aria-label="Menu principale">{links}</nav>
          {userBox}
        </aside>
      </div>

      <main className="pb-24 lg:pb-0 lg:pl-[248px]">
        <div className="mx-auto max-w-[1360px] px-4 py-5 sm:px-6 sm:py-7">{children}</div>
      </main>

      {/* Barra inferiore mobile: 4 voci principali */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#0b0a09] pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navigazione rapida">
        {items.filter((i) => i.mobile).slice(0, 4).map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(it);
          return (
            <Link key={it.href} href={it.href} className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11.5px] font-medium", active ? "text-white" : "text-neutral-400")}>
              <Icon size={20} className={active ? "text-[#ff5d55]" : ""} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
