import clsx from "clsx";

/** Stessi colori dei punti sulla mappa: viola per i rari, oro per i leggendari. */
export type Rarity = "RARO" | "LEGGENDARIO";
/** Colori da Impostazioni (variabili CSS impostate nel layout): --rare e --legend */
export const RARITY_COLOR: Record<Rarity, string> = { RARO: "var(--rare)", LEGGENDARIO: "var(--legend)" };
export const RARITY_LABEL: Record<Rarity, string> = { RARO: "Raro", LEGGENDARIO: "Leggendario" };
export const asRarity = (v: string | null | undefined): Rarity | null => (v === "RARO" || v === "LEGGENDARIO" ? v : null);

/** Stellina + nome: si riconosce subito anche nelle liste. */
export function RarityBadge({ rarity, className }: { rarity: Rarity | null; className?: string }) {
  if (!rarity) return null;
  const c = RARITY_COLOR[rarity];
  return (
    <span
      className={clsx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-bold tracking-wide text-white uppercase", className)}
      style={{ background: c, boxShadow: `0 0 0 1px ${c}` }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8Z" /></svg>
      {RARITY_LABEL[rarity]}
    </span>
  );
}

/** Contorno colorato per card e foto. */
export const rarityStyle = (rarity: Rarity | null): React.CSSProperties | undefined =>
  rarity ? { borderColor: RARITY_COLOR[rarity], boxShadow: `0 0 0 1px ${RARITY_COLOR[rarity]}, 0 0 18px -6px ${RARITY_COLOR[rarity]}` } : undefined;
