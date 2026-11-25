import clsx from "clsx";
import { Dumbbell, Store, Landmark, type LucideProps } from "lucide-react";

/** Testa di cavallo piena: si riconosce anche a 12px (il ferro di cavallo sembrava una "∩") */
export function HorseHead({ size = 12, className }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path fillRule="evenodd" d="M19.5 21.5H8.4l1.3-5c.4-1.5.2-3-.5-4.3l-2.1 1.5a1.7 1.7 0 0 1-2.2-.2l-1.4-1.4a1.7 1.7 0 0 1 0-2.4L8.4 4.6 10.9 2l.9 3.1c4.6 1.6 7.7 5.7 7.7 10.5ZM8.4 7.6a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" />
    </svg>
  );
}

/** Etichetta colorata del tipo di vendita. I colori si scelgono in Impostazioni (variabili --sale-*). */
export type SaleKind = "cavallo" | "addestramento" | "vetrina" | "blip";
const DEF: Record<SaleKind, { label: string; Icon: (p: LucideProps) => React.ReactNode }> = {
  cavallo: { label: "Cavallo", Icon: HorseHead },
  addestramento: { label: "Addestramento", Icon: Dumbbell },
  vetrina: { label: "Vetrina", Icon: Store },
  blip: { label: "Blip", Icon: Landmark },
};

export function SaleTag({ kind, short = false, className }: { kind: SaleKind; short?: boolean; className?: string }) {
  const { label, Icon } = DEF[kind];
  return (
    <span className={clsx("sale-tag", className)} style={{ "--tag": `var(--sale-${kind})` } as React.CSSProperties} title={label}>
      <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
      {short ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
