import { currentAge } from "./age";
import { priceBracket, listPriceFor, type Bracket } from "./pricing";
import type { Settings } from "./settings";

type HorseLike = {
  ageBase: unknown;
  ageCheckpointAt: Date;
  coat: { salePriceA: unknown; salePriceB: unknown; governmentPrice: unknown };
};

export function horseAge(h: HorseLike, s: Settings, now = new Date()) {
  return currentAge(Number(h.ageBase), h.ageCheckpointAt, s.daysPerYear, now);
}

export function horsePricing(h: HorseLike, s: Settings, now = new Date()) {
  const age = horseAge(h, s, now);
  const bracket: Bracket = priceBracket(age, s);
  const prices = {
    salePriceA: h.coat.salePriceA == null ? null : Number(h.coat.salePriceA),
    salePriceB: h.coat.salePriceB == null ? null : Number(h.coat.salePriceB),
    governmentPrice: h.coat.governmentPrice == null ? null : Number(h.coat.governmentPrice),
  };
  return { age, bracket, listPrice: listPriceFor(bracket, prices), prices };
}

export const STATUS_LABEL = {
  IN_STALLA: "In stalla",
  VENDUTO: "Venduto",
  VENDUTO_GOVERNO: "Venduto al Governo",
  RIMOSSO: "Uscito",
} as const;

export const SEX_LABEL = { MASCHIO: "Maschio", FEMMINA: "Femmina" } as const;

export const CONDITIONS = ["Sano", "Ferito", "Malato", "In addestramento", "Riservato"];
