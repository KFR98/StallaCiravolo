import Link from "next/link";
import type { ReactNode } from "react";
import clsx from "clsx";

export function Panel({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("panel rise", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c4a874] px-4 pt-3 pb-2 sm:px-5">
          {title && <h2 className="title-fell text-[19px] text-leather">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(pad && "panel-pad", "relative")}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="title-western text-[28px] leading-tight text-paper drop-shadow-[0_2px_0_rgba(0,0,0,.6)] sm:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[16px] text-paper-3/90 italic">{subtitle}</p>}
        <div className="mt-2 h-[3px] w-40 bg-gradient-to-r from-gold-bright via-gold to-transparent" />
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <div className="panel panel-pad rise h-full transition hover:-translate-y-0.5">
      <div className="label">{label}</div>
      <div className="mt-1 font-serif text-[30px] leading-none font-semibold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-1.5 text-[14px] text-ink-soft italic">{hint}</div>}
      <div className="absolute right-3 bottom-2 text-gold/50 select-none">✦</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-ink-soft italic">{children}</div>;
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-ink-soft italic">{hint}</span>}
    </label>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">{children}</div>;
}

export function Divider({ children }: { children?: ReactNode }) {
  return <div className="ornament my-4 title-fell text-[13px] tracking-[0.2em] uppercase">{children ?? "✦"}</div>;
}
