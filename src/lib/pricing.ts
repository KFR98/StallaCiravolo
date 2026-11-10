import type { Settings } from "./settings";

export type Bracket = "TROPPO_GIOVANE" | "A" | "B" | "LIBERO";

export type CoatPrices = {
  salePriceA: number | null;
  salePriceB: number | null;
  governmentPrice: number | null;
};

/** Fascia di prezzo in base all'età (anni compiuti). */
export function priceBracket(age: number, s: Pick<Settings, "minSaleAge" | "bracketAMax" | "bracketBMax">): Bracket {
  const years = Math.floor(age + 1e-9);
  if (age + 1e-9 < s.minSaleAge) return "TROPPO_GIOVANE";
  if (years <= s.bracketAMax) return "A";
  if (years <= s.bracketBMax) return "B";
  return "LIBERO";
}

export function bracketLabel(b: Bracket, s: Pick<Settings, "minSaleAge" | "bracketAMax" | "bracketBMax">) {
  switch (b) {
    case "TROPPO_GIOVANE":
      return `Sotto i ${s.minSaleAge} anni (non vendibile)`;
    case "A":
      return `${s.minSaleAge}-${s.bracketAMax} anni`;
    case "B":
      return `${s.bracketAMax + 1}-${s.bracketBMax} anni`;
    case "LIBERO":
      return `Oltre ${s.bracketBMax} anni (prezzo libero)`;
  }
}

export function listPriceFor(b: Bracket, p: CoatPrices): number | null {
  if (b === "A") return p.salePriceA;
  if (b === "B") return p.salePriceB;
  return null;
}

export function applyDiscount(price: number, type: "PERCENTUALE" | "IMPORTO" | null, value: number | null) {
  if (!type || !value || value <= 0) return round2(price);
  if (type === "PERCENTUALE") return round2(Math.max(0, price * (1 - Math.min(value, 100) / 100)));
  return round2(Math.max(0, price - value));
}

export const round2 = (v: number) => Math.round(v * 100) / 100;
