import type { Coat, Breed, Horse } from "@prisma/client";
import { can } from "./permissions";
import type { Settings } from "./settings";
import { horsePricing } from "./horses";
import { bracketLabel, round2 } from "./pricing";
import { UserError } from "./action";

/**
 * Prezzo di vendita di un cavallo della stalla, calcolato SEMPRE sul server dal listino.
 * Regole (le stesse di sempre):
 * - fascia d'età calcolata, cambiabile a mano (viene scritto nelle note);
 * - sotto l'età minima solo con il permesso "vendere cavalli troppo giovani";
 * - rari e leggendari: prezzo libero, addestramento al prezzo dei rari;
 * - cambiare il prezzo di listino solo con "cambiare il prezzo di listino";
 * - già addestrato in stalla: l'addestramento è compreso e non si aggiunge di nuovo.
 */
export type HorseSaleInput = { bracket: "A" | "B" | "LIBERO"; withTraining: boolean; manualPrice: number | null };
type H = Horse & { coat: Coat; breed: Breed };

export function quoteHorseSale(horse: H, s: Settings, user: { id: number; role: string }, input: HorseSaleInput, now = new Date()) {
  if (horse.status !== "IN_STALLA") throw new UserError("Il cavallo non è più disponibile in stalla.");
  if (horse.ownerId !== user.id && !can(user.role, "horses.manageAll")) throw new UserError("Questo cavallo è in carico a un altro stalliere: solo lui (o la direzione) può venderlo.");
  if (horse.needsData) throw new UserError("Prima completa i dati del puledro (targa e sesso).");
  const { age, bracket: computed } = horsePricing(horse, s, now);
  const override = can(user.role, "sales.overridePrice");
  const rare = horse.rarity === "RARO" || horse.rarity === "LEGGENDARIO";
  if (computed === "TROPPO_GIOVANE" && !can(user.role, "horses.sellUnderage")) {
    throw new UserError(`Il cavallo ha ${age.toFixed(1)} anni: si può vendere solo dai ${s.minSaleAge} anni. Se l'età è sbagliata chiedi a direttore, gestore o admin.`);
  }
  const bracket = rare ? "LIBERO" : input.bracket;
  const bracketChanged = !rare && bracket !== computed;
  const listBase = rare ? null : bracket === "A" ? horse.coat.basePriceA : bracket === "B" ? horse.coat.basePriceB : null;
  const basePrice = listBase == null ? null : Number(listBase);
  let base: number;
  if (basePrice == null) {
    if (input.manualPrice == null) throw new UserError("Per questa fascia il prezzo del cavallo lo decide lo stalliere: inseriscilo.");
    base = input.manualPrice;
  } else if (input.manualPrice != null && input.manualPrice !== basePrice) {
    if (!override) throw new UserError("Solo chi può cambiare il prezzo di listino può modificare il prezzo base. Usa il prezzo forfettario.");
    base = input.manualPrice;
  } else base = basePrice;
  if (!Number.isFinite(base) || base < 0 || base > 10_000_000) throw new UserError("Prezzo del cavallo non valido.");
  const withTraining = horse.trained || input.withTraining;
  if (!rare && withTraining && horse.coat.trainingPrice == null) throw new UserError("Per questo manto non c'è un prezzo di addestramento nel listino.");
  const training = !withTraining ? 0 : rare ? s.rareTrainingPrice : Number(horse.coat.trainingPrice);
  const label = `${horse.breed.name} – ${horse.coat.name}${horse.plate ? ` (${horse.plate})` : ""}`;
  return {
    age, computed, bracket, rare, base, training, horsePrice: round2(base + training), label,
    priceBracket: rare ? (horse.rarity === "RARO" ? "Raro · prezzo libero" : "Leggendario · prezzo libero") : bracketLabel(bracket, s),
    notes: [
      horse.pregnancyDueAt ? "Venduta incinta" : null,
      bracketChanged ? `Fascia scelta a mano: ${bracketLabel(bracket, s)} (età calcolata ${age.toFixed(1)} anni)` : null,
      horse.trained ? "Già addestrato in stalla" : null,
    ].filter(Boolean) as string[],
  };
}
