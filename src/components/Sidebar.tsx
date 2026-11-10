"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, BookOpen, Scale, ScrollText, Warehouse, PlusCircle, Receipt, Map, NotebookPen,
  Users, Coins, Shield, LogOut, Menu, X,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; section?: string };

const ICONS = {
  dashboard: LayoutDashboard,
  catalog: BookOpen,
  compare: Scale,
  price: ScrollText,
  stable: Warehouse,
  add: PlusCircle,
  sales: Receipt,
  map: Map,
  notes: NotebookPen,
  users: Users,
  coins: Coins,
  admin: Shield,
};

export function Sidebar({
  items,
  user,
  stableName,
  logout,
}: {
  items: NavItem[];
  user: { displayName: string; roleLabel: string };
  stableName: string;
  logout: () => Promise<void>;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  let lastSection: string | undefined;

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-4 text-center">
        <div className="title-fell text-[11px] tracking-[0.4em] text-gold-bright/70 uppercase">Gestionale</div>
        <Link href="/" className="title-western mt-1 block text-[24px] leading-tight text-gold-bright drop-shadow-[0_2px_0_rgba(0,0,0,.7)]">
          {stableName}
        </Link>
        <div className="ornament mt-3 text-gold/70 text-[10px]">✦</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {items.map((it) => {
          const Icon = ICONS[it.icon];
          const header = it.section && it.section !== lastSection ? it.section : null;
          lastSection = it.section;
          return (
            <div key={it.href}>
              {header && <div className="title-fell mt-4 mb-1 px-3 text-[11px] tracking-[0.3em] text-gold/80 uppercase">{header}</div>}
              <Link
                href={it.href}
                className={clsx(
                  "group mb-0.5 flex items-center gap-3 rounded-[2px] px-3 py-2 title-fell text-[15.5px] tracking-[0.05em] transition",
                  isActive(it.href)
                    ? "bg-gradient-to-r from-gold-bright/25 to-transparent text-gold-bright shadow-[inset_3px_0_0_#d6b25e]"
                    : "text-paper-2/85 hover:bg-white/5 hover:text-paper",
                )}
              >
                <Icon size={18} strokeWidth={1.6} className="shrink-0 opacity-90" />
                <span className="truncate">{it.label}</span>
              </Link>
            </div>
          );
        })}
      </div>
      <div className="border-t border-gold/25 px-4 py-3">
        <div className="truncate text-[16px] text-paper">{user.displayName}</div>
        <div className="title-fell text-[12px] tracking-[0.15em] text-gold-bright/80 uppercase">{user.roleLabel}</div>
        <form action={logout} className="mt-2">
          <button className="flex items-center gap-2 title-fell text-[14px] text-paper-3/80 hover:text-paper">
            <LogOut size={15} /> Esci
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <>
      {/* Barra mobile */}
      <div className="leather sticky top-0 z-40 flex items-center justify-between border-b border-gold/30 px-4 py-2.5 lg:hidden">
        <Link href="/" className="title-western text-[20px] text-gold-bright">{stableName}</Link>
        <button onClick={() => setOpen(true)} aria-label="Apri menu" className="text-paper p-1">
          <Menu />
        </button>
      </div>
      {/* Drawer mobile */}
      <div className={clsx("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}>
        <div className={clsx("absolute inset-0 bg-black/60 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside className={clsx("leather absolute inset-y-0 left-0 w-[280px] border-r border-gold/30 shadow-2xl transition-transform", open ? "translate-x-0" : "-translate-x-full")}>
          <button onClick={() => setOpen(false)} aria-label="Chiudi menu" className="absolute top-3 right-3 text-paper/80">
            <X />
          </button>
          {nav}
        </aside>
      </div>
      {/* Sidebar desktop */}
      <aside className="leather fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r-2 border-[#1a0f07] shadow-[4px_0_18px_rgba(0,0,0,.5)] lg:block">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gold/30" />
        {nav}
      </aside>
    </>
  );
}
