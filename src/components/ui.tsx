import Link from "next/link";
import type { ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="h-display text-[30px] sm:text-[36px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-fg-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("card fade-up", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          {title && <h2 className="h-display text-[18px]">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx(pad && "card-pad")}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "accent" }) {
  const body = (
    <div className={clsx("card card-pad h-full transition-colors", href && "hover:border-border-strong")}>
      <div className="eyebrow">{label}</div>
      <div className={clsx("mt-1 text-[28px] leading-tight font-bold tabular-nums", tone === "accent" && "text-accent-text")}>{value}</div>
      {hint && <div className="mt-0.5 text-[13px] text-fg-3">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-fg-3">
      <div>{children}</div>
      {action}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-fg-3">{hint}</span>}
    </label>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">{children}</div>;
}

/** Schede di navigazione interne a una sezione (link). */
export function Tabs({ items, active }: { items: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <nav className="tabs mb-5" aria-label="Sezioni">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className="tab" aria-current={t.key === active ? "page" : undefined}>
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded bg-surface-3 px-1.5 text-[12px] text-fg-3">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Miniatura del cavallo (sempre accanto al nome). */
export function HorseThumb({ src, alt = "", size = 36, className }: { src: string | null | undefined; alt?: string; size?: number; className?: string }) {
  return (
    <span
      className={clsx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-3 align-middle", className)}
      style={{ width: size * 1.25, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <HorseGlyph size={size * 0.6} />
      )}
    </span>
  );
}

export function HorseGlyph({ size = 20 }: { size?: number }) {
  // Ferro di cavallo: segnaposto quando manca la foto del manto
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="text-fg-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6.5 20.5 5.6 13A6.5 6.5 0 0 1 12 5.5 6.5 6.5 0 0 1 18.4 13l-.9 7.5" />
      <path d="M8 9.5h.01M16 9.5h.01M7.2 14h.01M16.8 14h.01" strokeWidth="2.6" />
    </svg>
  );
}

/** Nome del cavallo con miniatura. */
export function HorseName({ image, breed, coat, href, sub, size = 36 }: { image: string | null | undefined; breed: string; coat?: string | null; href?: string; sub?: ReactNode; size?: number }) {
  const inner = (
    <span className="flex min-w-0 items-center gap-2.5">
      <HorseThumb src={image} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{breed}</span>
        {(coat || sub) && <span className="block truncate text-[13px] text-fg-3">{coat}{coat && sub ? " · " : ""}{sub}</span>}
      </span>
    </span>
  );
  return href ? <Link href={href} className="block min-w-0 hover:text-accent-text">{inner}</Link> : inner;
}
