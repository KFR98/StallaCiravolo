import clsx from "clsx";
import { Dumbbell, Store, Landmark, type LucideProps } from "lucide-react";

/** Ferro di cavallo (stesso stile delle icone lucide) */
function Horseshoe({ size = 12, strokeWidth = 2.4, ...rest }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" {...rest}>
      <path d="M6.5 20.5 5.6 13A6.5 6.5 0 0 1 12 5.5 6.5 6.5 0 0 1 18.4 13l-.9 7.5" />
      <path d="M8 9.5h.01M16 9.5h.01M7.2 14h.01M16.8 14h.01" strokeWidth={Number(strokeWidth) + 0.4} />
    </svg>
  );
}

/** Etichetta colorata del tipo di vendita. I colori si scelgono in Impostazioni (variabili --sale-*). */
export type SaleKind = "cavallo" | "addestramento" | "vetrina" | "blip";
const DEF: Record<SaleKind, { label: string; Icon: (p: LucideProps) => React.ReactNode }> = {
  cavallo: { label: "Cavallo", Icon: Horseshoe },
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
